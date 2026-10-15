"""Video -> automatic hold masks, 2D pose tracks and tentative contact events.

One person and a stationary camera. No training, route selection or coaching.
All coordinates refer to decoded, orientation-corrected video frames, in pixels.
"""

import time

PROCESS_STARTED = time.perf_counter()

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess

ROOT = Path(__file__).resolve().parent
for name, folder in [("YOLO_CONFIG_DIR", "yolo"), ("MPLCONFIGDIR", "mpl"), ("XDG_CACHE_HOME", "xdg")]:
    path = ROOT / ".cache" / folder
    path.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault(name, str(path))

import cv2
import mediapipe as mp
import numpy as np
import torch
from torchvision.ops import nms
from ultralytics import YOLO
from ultralytics.models.sam import Predictor

LIMBS = {"lh": [15, 19], "rh": [16, 20], "lf": [31], "rf": [32]}


def read_video_info(cap):
    fps = cap.get(cv2.CAP_PROP_FPS)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if not cap.isOpened() or fps <= 0 or count <= 0:
        raise ValueError("Cannot open video or determine its duration")
    return {"width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": fps, "frame_count": count, "duration_s": count / fps}


def build_hold_map(video, models, device, confidence):
    """Detect on three early frames; NMS deduplicates boxes before segmentation."""
    detector = YOLO(str(models / "holds.pt"))
    frames, boxes, scores, origins = [], [], [], []
    cap = cv2.VideoCapture(str(video))
    info = read_video_info(cap)
    for at in sorted(set([0.0, min(0.5, info["duration_s"] / 3), min(1.0, info["duration_s"] / 2)])):
        cap.set(cv2.CAP_PROP_POS_MSEC, at * 1000)
        ok, frame = cap.read()
        if not ok:
            raise ValueError(f"Cannot read hold-map frame at {at}s")
        frame_id = len(frames)
        frames.append(frame)
        result = detector(frame, imgsz=1280, conf=confidence, max_det=600,
                          device=device, verbose=False)[0]
        boxes.extend(result.boxes.xyxy.cpu().tolist())
        scores.extend(result.boxes.conf.cpu().tolist())
        origins.extend([frame_id] * len(result.boxes))
    cap.release()
    if not boxes:
        return []
    keep = nms(torch.tensor(boxes), torch.tensor(scores), 0.35).tolist()
    segmenter = Predictor(overrides={"model": str(models / "mobile_sam.pt"),
                                    "task": "segment", "mode": "predict", "imgsz": 1024,
                                    "device": device, "verbose": False, "save": False})
    holds = []
    for frame_id, frame in enumerate(frames):
        selected = [i for i in keep if origins[i] == frame_id]
        if not selected:
            continue
        segmenter.set_image(frame)  # Reuse encoder features for small prompt batches.
        for offset in range(0, len(selected), 16):
            batch = selected[offset:offset + 16]
            result = segmenter(bboxes=[boxes[i] for i in batch])[0]
            if result.masks is None or len(result.masks.xy) != len(batch):
                raise RuntimeError("SAM did not return one mask per detected hold")
            for index, polygon in zip(batch, result.masks.xy):
                if len(polygon) < 3 or cv2.contourArea(polygon) < 4:
                    continue
                holds.append({"id": len(holds), "polygon": polygon.round(2).tolist(),
                              "bbox": [round(x, 2) for x in boxes[index]],
                              "detector_confidence": round(scores[index], 4),
                              "source_frame": frame_id})
        segmenter.reset_image()
    return holds


def limb_observation(landmarks, limb, contours, visibility):
    """Geometric hypothesis only. Model visibility is not a calibrated probability."""
    points = [landmarks[i] for i in LIMBS[limb]
              if landmarks[i][2] >= visibility and landmarks[i][3] >= visibility]
    if not points:
        return {"state": "unknown", "hold_id": None}
    torso = np.linalg.norm(np.mean(np.array(landmarks)[[11, 12], :2], axis=0)
                           - np.mean(np.array(landmarks)[[23, 24], :2], axis=0))
    radius = float(np.clip(torso * (0.15 if limb.endswith("h") else 0.10), 3, 20))
    distances = []
    for hold_id, contour in contours.items():
        distance = min(max(0.0, -cv2.pointPolygonTest(contour, (p[0], p[1]), True)) for p in points)
        if distance <= radius:
            distances.append((distance, hold_id))
    distances.sort()
    if not distances:
        return {"state": "no_hold", "hold_id": None}
    if len(distances) > 1 and distances[1][0] - distances[0][0] < radius * 0.2:
        return {"state": "unknown", "hold_id": None, "reason": "ambiguous_holds"}
    return {"state": "candidate", "hold_id": distances[0][1],
            "distance_px": round(distances[0][0], 2)}


def contact_events(frames, duration, min_contact=0.5, max_gap=0.2):
    """Join same-hold observations across short gaps; keep raw gaps in frame data."""
    events = []
    for limb in LIMBS:
        current = None

        def finish():
            if current and current["observed_s"] + 1e-8 >= min_contact:
                events.append({**current, "limb": limb, "state": "tentative_contact"})

        for i, frame in enumerate(frames):
            t = frame["t"]
            end = frames[i + 1]["t"] if i + 1 < len(frames) else duration
            hold = frame["limbs"][limb]["hold_id"]
            if current and (t - current["end_s"] > max_gap + 1e-8
                            or (hold is not None and hold != current["hold_id"])):
                finish()
                current = None
            if hold is None:
                continue
            if current is None:
                current = {"hold_id": hold, "start_s": t, "end_s": end, "observed_s": end - t}
            else:
                current["end_s"] = end
                current["observed_s"] += end - t
        finish()
    return sorted([{k: round(v, 4) if isinstance(v, float) else v for k, v in event.items()}
                   for event in events], key=lambda event: (event["start_s"], event["limb"]))


def pose_and_contacts(video, model, holds, sample_fps, visibility):
    cap = cv2.VideoCapture(str(video))
    info = read_video_info(cap)
    if info["duration_s"] > 60.05:
        raise ValueError("Use a clip of at most 60 seconds; trim the source before running")
    contours = {h["id"]: np.asarray(h["polygon"], dtype=np.float32) for h in holds}
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model),
                                         delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.VIDEO, num_poses=1)
    frames, next_sample, previous_t, decoded = [], 0.0, -1.0, 0
    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as pose:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            # OpenCV's FFmpeg backend exposes presentation timestamps, also for VFR.
            t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if t <= previous_t:
                raise ValueError("Non-increasing video timestamps; normalize with FFmpeg")
            previous_t = t
            decoded += 1
            if t + 1e-6 < next_sample:
                continue
            next_sample += 1 / sample_fps
            while next_sample <= t + 1e-6:
                next_sample += 1 / sample_fps
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            result = pose.detect_for_video(image, int(round(t * 1000)))
            landmarks = []
            limbs = {name: {"state": "unknown", "hold_id": None} for name in LIMBS}
            if result.pose_landmarks:
                landmarks = [[round(p.x * info["width"], 3), round(p.y * info["height"], 3),
                              round(p.visibility, 4), round(p.presence, 4)]
                             for p in result.pose_landmarks[0]]
                limbs = {name: limb_observation(landmarks, name, contours, visibility) for name in LIMBS}
            frames.append({"t": round(t, 6), "keypoints": landmarks, "limbs": limbs})
    cap.release()
    if decoded < info["frame_count"] - 1:
        raise ValueError(f"Premature decode failure: {decoded}/{info['frame_count']} frames")
    return info, frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--models", type=Path, default=ROOT / "assets/models")
    parser.add_argument("--device", default="cpu", choices=["cpu", "mps"])
    parser.add_argument("--fps", type=float, default=10)
    parser.add_argument("--hold-confidence", type=float, default=0.25)
    parser.add_argument("--visibility", type=float, default=0.5)
    parser.add_argument("--min-contact", type=float, default=0.5)
    parser.add_argument("--max-gap", type=float, default=0.2)
    parser.add_argument("--holds-json", type=Path, help="Diagnostic only: substitute a supplied hold map")
    args = parser.parse_args()
    if not 0 < args.fps <= 30 or args.min_contact <= 0 or args.max_gap < 0:
        parser.error("fps must be in (0, 30], min-contact > 0, max-gap >= 0")
    args.output.mkdir(parents=True, exist_ok=True)
    for name in ["holds.pt", "mobile_sam.pt", "pose_landmarker_heavy.task"]:
        if not (args.models / name).is_file():
            parser.error(f"Missing {name}; run fetch_assets.py first")
    check = cv2.VideoCapture(str(args.video))
    info = read_video_info(check)
    check.release()
    if info["duration_s"] > 60.05:
        parser.error("Input must be at most 60 seconds")
    torch.set_num_threads(4)
    timings = {"startup_s": time.perf_counter() - PROCESS_STARTED}
    at = time.perf_counter()
    if args.holds_json:
        holds = json.loads(args.holds_json.read_text())["holds"]
    else:
        holds = build_hold_map(args.video, args.models, args.device, args.hold_confidence)
    timings["hold_map_s"] = time.perf_counter() - at
    print(f"hold map: {len(holds)} holds, {timings['hold_map_s']:.2f}s", flush=True)
    at = time.perf_counter()
    info, frames = pose_and_contacts(args.video, args.models / "pose_landmarker_heavy.task",
                                     holds, args.fps, args.visibility)
    timings["pose_and_matching_s"] = time.perf_counter() - at
    events = contact_events(frames, info["duration_s"], args.min_contact, args.max_gap)
    code_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    payload = {"schema_version": 1, "code_sha256": code_hash,
               "mode": "diagnostic_supplied_holds" if args.holds_json else "automatic",
               "video": {**info, "path": str(args.video.resolve()),
                         "sha256": hashlib.sha256(args.video.read_bytes()).hexdigest()},
               "coordinates": "decoded frame pixels; keypoint=[x,y,visibility,presence]; MediaPipe indices",
               "config": {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
               "holds": holds, "frames": frames, "events": events}
    (args.output / "result.json").write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
    timings["total_to_json_s"] = time.perf_counter() - PROCESS_STARTED
    hardware = {}
    if platform.system() == "Darwin":
        for name in ["machdep.cpu.brand_string", "hw.memsize", "hw.logicalcpu"]:
            query = subprocess.run(["sysctl", "-n", name], capture_output=True, text=True)
            hardware[name] = query.stdout.strip() if query.returncode == 0 else "unavailable"
    metrics = {"mode": payload["mode"], "code_sha256": code_hash,
               "timings": timings, "video_duration_s": info["duration_s"],
               "sampled_frames": len(frames), "pose_frames": sum(bool(f["keypoints"]) for f in frames),
               "holds": len(holds), "contact_events": len(events),
               "unknown_fraction": {limb: sum(f["limbs"][limb]["state"] == "unknown" for f in frames) / len(frames)
                                    for limb in LIMBS},
               "within_300s": timings["total_to_json_s"] <= 300,
               "environment": {"platform": platform.platform(), "hardware": hardware,
                               "python": platform.python_version(),
                               "torch_threads": torch.get_num_threads(), "device": args.device,
                               "pose_device": "cpu", "packages": {name: importlib.metadata.version(name)
                               for name in ["mediapipe", "ultralytics", "torch", "numpy", "opencv-python"]}}}
    (args.output / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
