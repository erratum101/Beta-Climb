"""Post-hoc timing/occlusion sensitivity of SAVED predictions; no model tuning.

Occlusion comes only from the human CSV labels, never model visibility. Original
scores remain unchanged. Event identity (limb + hold) and one-to-one assignment
are required even in relaxed modes. All metrics include precision AND recall.
"""

import csv
import hashlib
import json
from pathlib import Path
import re

from evaluate import assign, box_iou, reference_holds, temporal_iou

ROOT = Path(__file__).resolve().parent
GROUPS = {"all": {"lh", "rh", "lf", "rf"}, "hands": {"lh", "rh"}, "feet": {"lf", "rf"}}
SAMPLES = [("p2a_orange", "development"), ("p3_orange", "test-p3"), ("p4_green", "test-p4")]
DELAYS = (0, 0.25, 0.5, 1.0)


def merge(intervals):
    result = []
    for a, b in sorted(intervals):
        if b <= a:
            continue
        if result and a <= result[-1][1] + 1e-9:
            result[-1][1] = max(result[-1][1], b)
        else:
            result.append([a, b])
    return result


def subtract(intervals, excluded):
    result = merge(intervals)
    for left, right in merge(excluded):
        pieces = []
        for start, end in result:
            if right <= start or left >= end:
                pieces.append([start, end])
            else:
                if start < left:
                    pieces.append([start, left])
                if right < end:
                    pieces.append([right, end])
        result = pieces
    return result


def length(intervals):
    return sum(b - a for a, b in merge(intervals))


def overlap(a, b):
    return sum(max(0.0, min(y, v) - max(x, u)) for x, y in merge(a) for u, v in merge(b))


def interval_iou(a, b):
    intersection = overlap(a, b)
    union = length(a) + length(b) - intersection
    return intersection / union if union > 1e-9 else 0.0


def read_occlusions(path, fps, duration):
    result = {limb: [] for limb in GROUPS["all"]}
    with path.open(newline="") as file:
        for row in list(csv.reader(file))[1:]:
            limb, _ = row[0].split(" ", 1)
            event_start, event_end = int(row[1]) / fps, min(duration, (int(row[2]) + 1) / fps)
            if event_start >= duration:
                continue
            for token in row[3].split(","):
                token = token.strip()
                if token.lower() in ("", "none"):
                    continue
                match = re.fullmatch(r"(\d+)(?:-(\d+))?", token)
                if not match:
                    raise ValueError(f"Invalid occlusion label: {token}")
                first = int(match[1])
                last = int(match[2] or match[1])
                result[limb].append([max(event_start, first / fps), min(event_end, (last + 1) / fps)])
    return {limb: merge(intervals) for limb, intervals in result.items()}


def stats(tp, n_pred, n_ref):
    p = tp / n_pred if n_pred else 0.0
    r = tp / n_ref if n_ref else 0.0
    return {"tp": tp, "fp": n_pred - tp, "fn": n_ref - tp,
            "precision": p, "recall": r, "f1": 2 * p * r / (p + r) if p + r else 0,
            "both_at_least_70_percent": p >= 0.7 and r >= 0.7}


def delay_grid(maximum, fps):
    # One source-frame resolution; the requested endpoint is always included.
    return sorted(set([0.0, maximum] + [i / fps for i in range(int(maximum * fps) + 1)]))


def event_scores(predicted, reference, occlusions, duration, fps, visible=False,
                 delay=0, minimum_iou=0.5, ignore_timing=False):
    masks = occlusions if visible else {limb: [] for limb in GROUPS["all"]}
    def segments(e):
        return subtract([[e["start_s"], e["end_s"]]], masks[e["limb"]])
    ps = [(i, p, segments(p)) for i, p in enumerate(predicted) if length(segments(p)) > 1e-9]
    gs = [(i, g, segments(g)) for i, g in enumerate(reference) if length(segments(g)) > 1e-9]
    matrix = []
    for _, p, p_segments in ps:
        row = []
        for _, g, g_segments in gs:
            if (p["limb"], p["reference_hold_id"]) != (g["limb"], g["hold_id"]):
                row.append(0.0)
                continue
            if ignore_timing:
                row.append(1.0)
                continue
            best = 0.0
            for delta in delay_grid(delay, fps):
                # Backdate a possibly delayed prediction. Shift only its visible
                # evidence, then exclude occlusions at the aligned reference time.
                shifted = [[max(0, a - delta), min(duration, b - delta)] for a, b in p_segments]
                shifted = subtract(shifted, masks[p["limb"]])
                best = max(best, interval_iou(shifted, g_segments))
            row.append(best)
        matrix.append(row)
    threshold = 1 if ignore_timing else minimum_iou
    pairs = assign(matrix, threshold)
    matched = [(ps[i][0], gs[j][0]) for i, j in pairs]
    scores = {}
    for group, limbs in GROUPS.items():
        tp = sum(predicted[i]["limb"] in limbs for i, _ in matched)
        n_pred = sum(p["limb"] in limbs for _, p, _ in ps)
        n_ref = sum(g["limb"] in limbs for _, g, _ in gs)
        scores[group] = {**stats(tp, n_pred, n_ref),
                         "excluded_predictions": sum(p["limb"] in limbs for p in predicted) - n_pred,
                         "excluded_reference": sum(g["limb"] in limbs for g in reference) - n_ref}
    return {"scores": scores, "matched_events": matched}


def contains(intervals, time):
    return any(a <= time < b for a, b in intervals)


def frame_scores(result, evaluation, occlusions, visible=False, delay=0):
    """Apply one common fixed delay to all predictions, rather than cherry-pick frames."""
    mapping = {int(k): v for k, v in evaluation["hold_id_mapping"].items()}
    counts = {limb: dict(tp=0, fp=0, fn=0, tn=0, excluded_occluded=0,
                        excluded_unscorable=0, excluded_boundary=0) for limb in GROUPS["all"]}
    for frame in result["frames"]:
        t = frame["t"] - delay
        for limb, c in counts.items():
            if t < 0 or t >= result["video"]["duration_s"]:
                c["excluded_boundary"] += 1
                continue
            if visible and (contains(occlusions[limb], t) or contains(occlusions[limb], frame["t"])):
                c["excluded_occluded"] += 1
                continue
            if any(e["limb"] == limb and e["start_s"] <= t < e["end_s"]
                   for e in evaluation["unsupported_reference_events"]):
                c["excluded_unscorable"] += 1
                continue
            expected = {e["hold_id"] for e in evaluation["reference_events"]
                        if e["limb"] == limb and e["start_s"] <= t < e["end_s"]}
            pred = frame["limbs"][limb]["hold_id"]
            correct = pred is not None and mapping.get(pred) in expected
            c["tp"] += int(correct)
            c["fp"] += int(pred is not None and not correct)
            c["fn"] += int(bool(expected) and not correct)
            c["tn"] += int(pred is None and not expected)
    scores = {}
    for group, limbs in GROUPS.items():
        c = {k: sum(counts[limb][k] for limb in limbs) for k in counts["lh"]}
        scores[group] = {**c, **stats(c["tp"], c["tp"] + c["fp"], c["tp"] + c["fn"])}
    return scores


def error_breakdown(evaluation):
    matched_p = {i for i, _ in evaluation["scores"]["all"]["matched_events"]}
    counts = {k: 0 for k in ["unmapped_hold", "wrong_limb_hold_pair", "no_time_overlap",
                             "overlap_below_0.5", "duplicate_competing_prediction"]}
    for i, p in enumerate(evaluation["predicted_events"]):
        if i in matched_p:
            continue
        candidates = [g for g in evaluation["reference_events"]
                      if (g["limb"], g["hold_id"]) == (p["limb"], p["reference_hold_id"])]
        best = max((temporal_iou(p, g) for g in candidates), default=0)
        if p["reference_hold_id"] is None:
            cause = "unmapped_hold"
        elif not candidates:
            cause = "wrong_limb_hold_pair"
        elif best <= 0:
            cause = "no_time_overlap"
        elif best < 0.5:
            cause = "overlap_below_0.5"
        else:
            cause = "duplicate_competing_prediction"
        counts[cause] += 1
    return counts


def unique_pair_scores(predicted, reference, occlusions):
    """Optimistic fact-only metric: deduplicate limb/hold pairs and ignore all time."""
    scores = {}
    for group, limbs in GROUPS.items():
        ps = set()
        gs = set()
        for p in predicted:
            if p["limb"] not in limbs or not subtract([[p["start_s"], p["end_s"]]], occlusions[p["limb"]]):
                continue
            identity = ("mapped", p["reference_hold_id"]) if p["reference_hold_id"] is not None else ("unmapped", p["hold_id"])
            ps.add((p["limb"], identity))
        for g in reference:
            if g["limb"] in limbs and subtract([[g["start_s"], g["end_s"]]], occlusions[g["limb"]]):
                gs.add((g["limb"], ("mapped", g["hold_id"])))
        scores[group] = stats(len(ps & gs), len(ps), len(gs))
    return scores


def short_contact_examples(evaluation):
    examples = []
    for p in evaluation["predicted_events"]:
        candidates = [g for g in evaluation["reference_events"]
                      if (g["limb"], g["hold_id"]) == (p["limb"], p["reference_hold_id"])]
        if not candidates:
            continue
        g = max(candidates, key=lambda g: temporal_iou(p, g))
        iou = temporal_iou(p, g)
        if 0 < iou < 0.5:
            examples.append({"limb": p["limb"], "reference_hold_id": g["hold_id"],
                             "prediction": [p["start_s"], p["end_s"]],
                             "reference": [g["start_s"], g["end_s"]], "temporal_iou": iou,
                             "duration_ratio": (p["end_s"] - p["start_s"]) / (g["end_s"] - g["start_s"])})
    return examples


def visible_contact_diagnostics(result, evaluation, occlusions):
    mapping = {int(k): v for k, v in evaluation["hold_id_mapping"].items()}
    counts = {limb: dict(correct=0, low_confidence=0, missing_pose=0, ambiguous_holds=0,
                        no_hold_near_keypoints=0, wrong_hold=0) for limb in GROUPS["all"]}
    for frame in result["frames"]:
        for limb, c in counts.items():
            if contains(occlusions[limb], frame["t"]):
                continue
            if any(g["limb"] == limb and g["start_s"] <= frame["t"] < g["end_s"]
                   for g in evaluation["unsupported_reference_events"]):
                continue
            expected = {g["hold_id"] for g in evaluation["reference_events"]
                        if g["limb"] == limb and g["start_s"] <= frame["t"] < g["end_s"]}
            if not expected:
                continue
            p = frame["limbs"][limb]
            if p["hold_id"] is not None:
                cause = "correct" if mapping.get(p["hold_id"]) in expected else "wrong_hold"
            elif p["state"] == "unknown":
                cause = p.get("reason", "low_confidence" if frame["keypoints"] else "missing_pose")
            else:
                cause = "no_hold_near_keypoints"
            c[cause] += 1
    return {group: {k: sum(counts[limb][k] for limb in limbs) for k in counts["lh"]}
            for group, limbs in GROUPS.items()}


def main():
    output = ROOT / "results/tolerance"
    output.mkdir(parents=True, exist_ok=True)  # Recomputable analysis, original runs untouched.
    summary = {"method": {
        "kind": "post_hoc_sensitivity_not_new_validation", "training_or_inference_changes": False,
        "delays_seconds": DELAYS, "visibility_source": "human framesOccluded labels only",
        "events": "Same limb+hold, one-to-one; visible IoU uses interval unions after masking occlusions. Entirely hidden units excluded from both denominators.",
        "event_delay": "Allow each matched prediction to be backdated by up to delta at 1/source-fps resolution. This is a tolerant evaluator, not a learned delay correction.",
        "frames": "One fixed backdating delta for all predictions. Exclude occlusion at original and aligned time, unscorable labels and out-of-video times. Unknown remains FN on visible ground-truth contacts.",
        "any_overlap": "Positive overlap suffices to count a contact occurrence; does not certify its duration.",
        "identity_only": "Deliberately optimistic bound: correct limb and hold anywhere in video. Not an acceptable timed-contact metric.",
        "unique_pair": "Visible evidence only, ignore all timing and collapse repeated limb/hold pairs. Unmapped automatic IDs remain distinct false positives.",
        "limitations": ["Reuses known control results", "Occlusion annotated only during labelled contacts",
                        "No joint-coordinate or pixel-mask ground truth", "Frame scores use raw candidates, event scores use filtered contacts"],
    }, "code_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "samples": []}
    for sample, role in SAMPLES:
        folder = ROOT / "results/verification" / role
        result = json.loads((folder / "result.json").read_text())
        evaluation = json.loads((folder / "evaluation.json").read_text())
        duration, fps = result["video"]["duration_s"], result["video"]["fps"]
        annotation = ROOT / "assets/annotations" / f"{sample}_holdUsage.csv"
        occlusions = read_occlusions(annotation, fps, duration)
        predicted, reference = evaluation["predicted_events"], evaluation["reference_events"]
        modes = {}
        frames = {}
        for visible in (False, True):
            prefix = "visible" if visible else "all"
            for delay in DELAYS:
                modes[f"{prefix}_tiou50_delay{delay:g}"] = event_scores(
                    predicted, reference, occlusions, duration, fps, visible, delay)
                frames[f"{prefix}_fixed_delay{delay:g}"] = frame_scores(result, evaluation, occlusions, visible, delay)
            modes[f"{prefix}_any_overlap"] = event_scores(
                predicted, reference, occlusions, duration, fps, visible, minimum_iou=1e-8)
            modes[f"{prefix}_identity_only"] = event_scores(
                predicted, reference, occlusions, duration, fps, visible, ignore_timing=True)
        for group in GROUPS:
            for key in ("tp", "fp", "fn"):
                assert modes["all_tiou50_delay0"]["scores"][group][key] == evaluation["scores"][group][key]
        visibility = {}
        for group, limbs in GROUPS.items():
            contact_s = sum(e["end_s"] - e["start_s"] for e in reference if e["limb"] in limbs)
            hidden_s = sum(overlap([[e["start_s"], e["end_s"]]], occlusions[e["limb"]])
                           for e in reference if e["limb"] in limbs)
            visibility[group] = {"reference_contact_seconds": contact_s, "occluded_seconds": hidden_s,
                                 "occluded_fraction": hidden_s / contact_s if contact_s else 0}
        # Check whether one-to-one spatial ID matching itself creates these FPs.
        gt = reference_holds(ROOT / "assets/annotations" / f"{sample}_routeAnnotation.json")
        holds = {h["id"]: h for h in result["holds"]}
        unmapped = [p for p in predicted if p["reference_hold_id"] is None]
        best_ious = [max(box_iou(holds[p["hold_id"]]["bbox"], g["bbox"]) for g in gt) for p in unmapped]
        item = {"sample": sample, "role": role, "event_modes": modes, "frame_modes": frames,
                "visibility": visibility, "strict_false_positive_breakdown": error_breakdown(evaluation),
                "unique_visible_pairs_ignore_timing": unique_pair_scores(predicted, reference, occlusions),
                "short_contact_examples": short_contact_examples(evaluation),
                "visible_reference_contact_diagnostics": visible_contact_diagnostics(result, evaluation, occlusions),
                "unmapped_events": len(unmapped), "unmapped_with_any_box_iou_ge_0_3": sum(x >= 0.3 for x in best_ious),
                "inputs_sha256": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                                   for p in [folder / "result.json", folder / "evaluation.json", annotation]}}
        for group in GROUPS:
            c = item["visible_reference_contact_diagnostics"][group]
            s = frames["visible_fixed_delay0"][group]
            assert c["correct"] == s["tp"] and sum(c.values()) - c["correct"] == s["fn"]
        summary["samples"].append(item)
        (output / f"{role}.json").write_text(json.dumps(item, indent=2) + "\n")
        print(sample, flush=True)
        for mode in ["all_tiou50_delay0", "all_tiou50_delay0.5", "visible_tiou50_delay0",
                     "visible_tiou50_delay0.5", "visible_tiou50_delay1", "visible_any_overlap", "visible_identity_only"]:
            s = modes[mode]["scores"]["all"]
            print(f"  {mode}: P={s['precision']:.3f} R={s['recall']:.3f} TP/FP/FN={s['tp']}/{s['fp']}/{s['fn']}")
        print("  visible frames:", frames["visible_fixed_delay0"])
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
