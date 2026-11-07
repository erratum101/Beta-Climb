"""Evaluate against The Way Up annotations, never used by automatic inference."""

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment


def box_iou(a, b):
    intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection
    return intersection / union if union > 0 else 0


def temporal_iou(a, b):
    intersection = max(0, min(a["end_s"], b["end_s"]) - max(a["start_s"], b["start_s"]))
    union = max(a["end_s"], b["end_s"]) - min(a["start_s"], b["start_s"])
    return intersection / union if union > 0 else 0


def assign(scores, threshold):
    """Maximum-cardinality one-to-one matching; use overlap to break ties."""
    scores = np.asarray(scores)
    if scores.size == 0:
        return []
    # A whole extra match must outweigh any possible sum of overlap differences.
    reward = np.where(scores >= threshold, min(scores.shape) + 1 + scores, 0)
    rows, columns = linear_sum_assignment(-reward)
    return [(int(i), int(j)) for i, j in zip(rows, columns) if scores[i, j] >= threshold]


def reference_holds(path):
    data = json.loads(path.read_text())["holds"]
    return [{"id": i, "bbox": [h["topLeftCorner"]["x"], h["topLeftCorner"]["y"],
                                h["bottomRightCorner"]["x"], h["bottomRightCorner"]["y"]]}
            for i, h in enumerate(data)]


def reference_events(path, fps, duration):
    events, skipped = [], []
    with path.open(newline="") as file:
        for row in list(csv.reader(file))[1:]:
            limb, hold = row[0].split(" ", 1)
            start, end = int(row[1]) / fps, min((int(row[2]) + 1) / fps, duration)
            if start >= duration:
                continue
            if not hold.isdigit():
                skipped.append({"limb": limb, "label": hold, "start_s": start, "end_s": end})
                continue
            events.append({"limb": limb, "hold_id": int(hold), "start_s": start, "end_s": end})
    return events, skipped


def event_score(predicted, reference):
    overlaps = [[temporal_iou(p, g) if (p["limb"], p["reference_hold_id"]) == (g["limb"], g["hold_id"]) else 0
                 for g in reference] for p in predicted]
    matches = assign(overlaps, 0.5)
    tp = len(matches)
    precision = tp / len(predicted) if predicted else 0.0
    recall = tp / len(reference) if reference else 0.0
    return {"tp": tp, "fp": len(predicted) - tp, "fn": len(reference) - tp,
            "precision": precision, "recall": recall,
            "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
            "passes_quality": precision >= 0.85 and recall >= 0.80,
            "matched_events": matches}


def evaluate(result, route, usage):
    gt_holds = reference_holds(route)
    gt_events, skipped = reference_events(usage, result["video"]["fps"], result["video"]["duration_s"])
    holds = result["holds"]
    overlaps = [[box_iou(p["bbox"], g["bbox"]) for g in gt_holds] for p in holds]
    matches = assign(overlaps, 0.3)
    mapping = {holds[i]["id"]: gt_holds[j]["id"] for i, j in matches}
    predicted = [{**p, "reference_hold_id": mapping.get(p["hold_id"])} for p in result["events"]]
    groups = {"all": {"lh", "rh", "lf", "rf"}, "hands": {"lh", "rh"}, "feet": {"lf", "rf"}}
    groups.update({limb: {limb} for limb in ["lh", "rh", "lf", "rf"]})
    scores = {name: event_score([p for p in predicted if p["limb"] in limbs],
                               [g for g in gt_events if g["limb"] in limbs]) for name, limbs in groups.items()}
    used_holds = {e["hold_id"] for e in gt_events}
    return {"mode": result["mode"], "matching": {"box_iou_min": 0.3, "temporal_iou_min": 0.5,
             "one_to_one": True, "annotation_end_frames": "inclusive; clipped to video duration"},
            "quality_pass": all(scores[group]["passes_quality"] for group in ["all", "hands", "feet"]),
            "scores": scores,
            "used_hold_map_recall": len(set(mapping.values()) & used_holds) / len(used_holds) if used_holds else 0,
            "reference_events": gt_events, "unsupported_reference_events": skipped,
            "hold_id_mapping": mapping, "predicted_events": predicted,
            "note": "Wall contacts and unnamed wrong holds have no scorable hold ID. Predictions on unmapped holds count as false positives. Occluded numeric-hold events remain in recall."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("result", type=Path)
    parser.add_argument("--annotations", type=Path, required=True, help="Prefix, e.g. assets/annotations/p3_orange")
    args = parser.parse_args()
    result = json.loads(args.result.read_text())
    report = evaluate(result, Path(str(args.annotations) + "_routeAnnotation.json"),
                      Path(str(args.annotations) + "_holdUsage.csv"))
    args.result.with_name("evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    compact_scores = {name: {k: v for k, v in score.items() if k != "matched_events"}
                      for name, score in report["scores"].items()}
    print(json.dumps({"quality_pass": report["quality_pass"], "scores": compact_scores,
                      "used_hold_map_recall": report["used_hold_map_recall"]}, indent=2))


if __name__ == "__main__":
    main()
