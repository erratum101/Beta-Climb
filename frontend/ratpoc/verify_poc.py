"""Repeat the frozen three-video PoC and audit it against independent labels.

Run from ratpoc. Annotations are loaded only AFTER each inference subprocess exits.
This verifies the existing implementation; it does not tune or train any model.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import time

from evaluate import evaluate

ROOT = Path(__file__).resolve().parent
SAMPLES = [("p2a_orange", "development"), ("p3_orange", "test-p3"), ("p4_green", "test-p4")]
LIMBS = ("lh", "rh", "lf", "rf")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")


def sample_score(result, evaluation):
    """Diagnostic precision/recall at sampled timestamps, including all unknowns.

    A wrong hold adds both FP and FN. Unmapped predictions add FP. Wall/unnamed
    reference intervals cannot be assigned a hold ID and are explicitly excluded.
    Occluded numeric-hold labels remain in the denominator, as in event scoring.
    """
    mapping = {int(k): v for k, v in evaluation["hold_id_mapping"].items()}
    counts = {limb: dict(tp=0, fp=0, fn=0, tn=0, excluded=0) for limb in LIMBS}
    for frame in result["frames"]:
        for limb in LIMBS:
            count = counts[limb]
            if any(e["limb"] == limb and e["start_s"] <= frame["t"] < e["end_s"]
                   for e in evaluation["unsupported_reference_events"]):
                count["excluded"] += 1
                continue
            expected = {e["hold_id"] for e in evaluation["reference_events"]
                        if e["limb"] == limb and e["start_s"] <= frame["t"] < e["end_s"]}
            predicted = frame["limbs"][limb]["hold_id"]
            matched = predicted is not None and mapping.get(predicted) in expected
            count["tp"] += int(matched)
            count["fp"] += int(predicted is not None and not matched)
            count["fn"] += int(bool(expected) and not matched)
            count["tn"] += int(not expected and predicted is None)
    groups = {"all": LIMBS, "hands": ("lh", "rh"), "feet": ("lf", "rf")}
    groups.update({limb: (limb,) for limb in LIMBS})
    scores = {}
    for name, limbs in groups.items():
        c = {key: sum(counts[limb][key] for limb in limbs) for key in counts["lh"]}
        scores[name] = {**c, "precision": c["tp"] / max(1, c["tp"] + c["fp"]),
                        "recall": c["tp"] / max(1, c["tp"] + c["fn"])}
    return scores


def validate_output(result):
    """Structural correctness and coverage are NOT pose accuracy measurements."""
    assert result["mode"] == "automatic"
    assert result["config"]["holds_json"] is None
    duration = result["video"]["duration_s"]
    assert 0 < duration <= 60.05
    ids = {h["id"] for h in result["holds"]}
    assert ids and len(ids) == len(result["holds"])
    for hold in result["holds"]:
        assert len(hold["polygon"]) >= 3
        assert all(math.isfinite(x) for xy in hold["polygon"] for x in xy)
    previous = -1
    reliable = dict.fromkeys(LIMBS, 0)
    indices = {"lh": [15, 19], "rh": [16, 20], "lf": [31], "rf": [32]}
    for frame in result["frames"]:
        assert previous < frame["t"] < duration
        previous = frame["t"]
        points = frame["keypoints"]
        assert not points or len(points) == 33
        assert all(len(p) == 4 and all(math.isfinite(x) for x in p) for p in points)
        for limb in LIMBS:
            assert frame["limbs"][limb]["hold_id"] in ids | {None}
            reliable[limb] += int(bool(points) and any(
                min(points[i][2:]) >= result["config"]["visibility"] for i in indices[limb]))
    for event in result["events"]:
        assert event["hold_id"] in ids and event["limb"] in LIMBS
        assert 0 <= event["start_s"] < event["end_s"] <= duration + 1e-6
    n = len(result["frames"])
    assert n > 0
    return {"structure_pass": True, "frames": n,
            "pose_coverage": sum(bool(f["keypoints"]) for f in result["frames"]) / n,
            "confident_limb_coverage": {limb: value / n for limb, value in reliable.items()},
            "pose_accuracy": "not_measurable_without_independent_joint_coordinates",
            "mask_accuracy": "not_measurable_without_independent_pixel_masks"}


def prediction_hash(result):
    payload = {k: result[k] for k in ("holds", "frames", "events")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("results/verification"))
    args = parser.parse_args()
    output = (ROOT / args.output).resolve()
    output.relative_to(ROOT)  # Keep generated paths portable within ratpoc.
    output.mkdir(parents=True, exist_ok=False)  # Never overwrite an earlier experiment.
    manifest = json.loads((ROOT / "sources.json").read_text())
    resources = {entry["path"]: entry["sha256"] for entry in manifest["files"] + manifest["models"]}
    for path, expected in resources.items():
        assert sha256(ROOT / path) == expected, f"Changed resource: {path}"
    code = {name: sha256(ROOT / name) for name in ("prototype.py", "evaluate.py", "verify_poc.py")}
    protocol = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(), "code_sha256": code,
        "resources_sha256": resources,
        "samples": [{"name": name, "role": "development" if role == "development" else "control",
                     "clip": f"assets/clips/{name}.mp4"} for name, role in SAMPLES],
        "criteria": {"max_duration_s": 60, "max_processing_s": 300, "target_processing_s": 180,
                     "event_precision_min": 0.85, "event_recall_min": 0.80,
                     "temporal_iou_min": 0.5, "box_iou_min": 0.3,
                     "required_groups": ["all", "hands", "feet"],
                     "required_samples": ["p3_orange", "p4_green"]},
        "scope": "Reproduction on the same three videos, not a new unseen validation set.",
        "independence": "Human hold-use labels from The Way Up; no labels supplied to inference.",
        "pose_ground_truth_available": False, "mask_ground_truth_available": False,
        "input_note": "Published stabilized 720x1280 videos; p4 is clipped to 60s. Not raw 4K capture.",
        "not_measured": ["upload", "queue", "asset download", "rendering", "other hardware"],
    }
    write_json(output / "protocol.json", protocol)  # Frozen before ANY inference/evaluation.
    runs = []
    for name, role in SAMPLES:
        destination = output / role
        destination.mkdir()
        command = [sys.executable, str(ROOT / "prototype.py"), f"assets/clips/{name}.mp4",
                   "--output", str(destination.relative_to(ROOT))]
        started = time.perf_counter()
        process = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=420)
        process_wall = time.perf_counter() - started
        # Paths in diagnostics are project-relative, with no personal home directory.
        (destination / "inference.log").write_text(
            (process.stdout + process.stderr).replace(str(ROOT), "ratpoc"))
        if process.returncode:
            raise RuntimeError(f"Inference failed for {name}; see {destination.relative_to(ROOT)}/inference.log")
        result = json.loads((destination / "result.json").read_text())
        metrics = json.loads((destination / "metrics.json").read_text())
        assert result["code_sha256"] == code["prototype.py"]
        assert result["video"]["sha256"] == resources[f"assets/clips/{name}.mp4"]
        structure = validate_output(result)
        # Only now open the annotations, outside the timed inference subprocess.
        annotations = ROOT / "assets/annotations"
        evaluation = evaluate(result, annotations / f"{name}_routeAnnotation.json",
                              annotations / f"{name}_holdUsage.csv")
        write_json(destination / "evaluation.json", evaluation)
        frame_scores = sample_score(result, evaluation)
        write_json(destination / "frame_scores.json", frame_scores)
        baseline = json.loads((ROOT / "results" / role / "result.json").read_text())
        elapsed = metrics["timings"]["total_to_json_s"]
        run = {"sample": name, "role": role, "video_duration_s": result["video"]["duration_s"],
               "processing_s": elapsed, "process_wall_s": process_wall,
               "speed_pass": elapsed <= 300, "quality_pass": evaluation["quality_pass"],
               "required_contact_and_time_gate": elapsed <= 300 and evaluation["quality_pass"],
               "structure": structure,
               "event_scores": {g: {k: v for k, v in evaluation["scores"][g].items()
                                     if k != "matched_events"} for g in ["all", "hands", "feet"]},
               "frame_scores": {g: frame_scores[g] for g in ["all", "hands", "feet"]},
               "predictions_identical_to_first_run": prediction_hash(result) == prediction_hash(baseline)}
        # Only export paths change; predictions and measured processing remain untouched.
        result["video"]["path"] = f"assets/clips/{name}.mp4"
        result["config"]["models"] = "assets/models"
        (destination / "result.json").write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
        write_json(destination / "audit.json", run)
        runs.append(run)
        print(f"{name}: {elapsed:.2f}s; event P={run['event_scores']['all']['precision']:.3f} "
              f"R={run['event_scores']['all']['recall']:.3f}; quality={run['quality_pass']}", flush=True)
    for path, expected in resources.items():
        assert sha256(ROOT / path) == expected, f"Resource changed during run: {path}"
    for path, expected in code.items():
        assert sha256(ROOT / path) == expected, f"Code changed during run: {path}"
    controls = [run for run in runs if run["role"] != "development"]
    necessary_gate = all(run["required_contact_and_time_gate"] for run in controls)
    write_json(output / "summary.json", {
        "runs": runs, "code_and_resources_unchanged": True,
        "contact_and_time_gate_pass": necessary_gate,
        "assumption_result": "inconclusive_pose_accuracy_unmeasured" if necessary_gate
                             else "fails_for_this_pipeline_on_these_videos",
        "scope": "Failure of this pipeline does not prove that all ready-made models are infeasible.",
    })


if __name__ == "__main__":
    main()
