"""Independent wall detection, segmentation and pose inference stages."""

from pathlib import Path

import cv2
import numpy as np

from .media import capture, read_frame, video_info, weight

HOLD_COLORS = ("red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink")


class CameraReference:
    """Check whether a fixed map in the first frame still aligns with the wall."""

    def __init__(self, frame):
        self.detector = cv2.ORB_create(nfeatures=1100)
        self.size = tuple(max(2, round(x * min(1, 640 / max(frame.shape[:2]))))
                          for x in (frame.shape[1], frame.shape[0]))
        self.points, self.descriptors = self.describe(frame)

    def describe(self, frame):
        gray = cv2.cvtColor(cv2.resize(frame, self.size), cv2.COLOR_BGR2GRAY)
        return self.detector.detectAndCompute(gray, None)

    def assess(self, frame) -> dict:
        points, descriptors = self.describe(frame)
        unknown = {"state": "unverified", "displacementRatio": None}
        if self.descriptors is None or descriptors is None or len(descriptors) < 2:
            return unknown
        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(self.descriptors, descriptors, k=2)
        matches = [a for a, b in pairs if a.distance < 0.75 * b.distance]
        if len(matches) < 12:
            return unknown
        reference = np.float32([self.points[m.queryIdx].pt for m in matches])
        current = np.float32([points[m.trainIdx].pt for m in matches])
        transform, mask = cv2.estimateAffinePartial2D(reference, current, method=cv2.RANSAC,
                                                     ransacReprojThreshold=2.5)
        if transform is None:
            return unknown
        inliers = reference[mask.ravel() == 1]
        w, h = self.size
        # Points on a single limb or hold do not establish alignment across the wall.
        if len(inliers) < 10 or min(np.ptp(inliers, axis=0) / [w, h]) < 0.3:
            return unknown
        corners = np.float32([[0, 0], [w, 0], [0, h], [w, h]])
        delta = cv2.transform(corners[None], transform)[0] - corners
        ratio = float(np.max(np.linalg.norm(delta, axis=1)) / np.hypot(w, h))
        return {"state": "aligned" if ratio <= 0.02 else "shifted",
                "displacementRatio": round(ratio, 4)}


def detect_holds(source: Path, models_dir: Path) -> dict:
    import torch
    from torchvision.ops import nms
    from ultralytics import YOLO

    torch.set_num_threads(4)
    detector = YOLO(str(weight(models_dir, "holds.pt")))
    boxes, scores, frames = [], [], []
    with capture(source) as cap:
        info = video_info(cap)
        reference = CameraReference(read_frame(cap, 0))
        indices = {0, min(15, info["frameCount"] // 3), min(30, info["frameCount"] // 2)}
        for index in sorted(indices):
            frame = read_frame(cap, index)
            if index and reference.assess(frame)["state"] != "aligned":
                continue
            detected = detector(frame, imgsz=1280, conf=0.25, max_det=600,
                                device="cpu", verbose=False)[0].boxes
            boxes.extend(detected.xyxy.cpu().tolist())
            scores.extend(detected.conf.cpu().tolist())
            frames.extend([index] * len(detected))
    keep = nms(torch.tensor(boxes), torch.tensor(scores), 0.35).tolist() if boxes else []
    detections = [{"bbox": boxes[i], "confidence": round(scores[i], 4), "frame": frames[i]}
                  for i in keep]
    return {"video": info, "detections": detections}


def color_sample(frame_hsv, polygon):
    x, y, w, h = cv2.boundingRect(polygon)
    crop = frame_hsv[y:y + h, x:x + w]
    mask = np.zeros(crop.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [polygon - [x, y]], 1)
    pixels = crop[mask.astype(bool)]
    hue, saturation, value = pixels.T
    # Bands in OpenCV's 0..179 hue scale. Keep achromatic and mixed holds unidentified.
    labels = np.digitize(hue, [6, 18, 36, 84, 100, 131, 155, 172])
    labels[labels == 8] = 0
    bright = (saturation >= 65) & (value >= 45)
    counts = np.bincount(labels[bright], minlength=8)
    winner = int(np.argmax(counts))
    agreement = counts[winner] / len(pixels)
    return HOLD_COLORS[winner] if agreement >= 0.45 else "unknown", round(float(agreement), 3)


def segment_holds(source: Path, detection: dict, models_dir: Path) -> dict:
    import torch
    from ultralytics.models.sam import Predictor

    torch.set_num_threads(4)
    segmenter = Predictor(overrides={"model": str(weight(models_dir, "mobile_sam.pt")),
                           "task": "segment", "mode": "predict", "imgsz": 1024,
                           "device": "cpu", "verbose": False, "save": False})
    holds = []
    info = detection["video"]
    dims = np.float32([info["width"], info["height"]])
    with capture(source) as cap:
        for index in sorted({d["frame"] for d in detection["detections"]}):
            frame = read_frame(cap, index)
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            segmenter.set_image(frame)
            selected = [d for d in detection["detections"] if d["frame"] == index]
            for offset in range(0, len(selected), 16):
                batch = selected[offset:offset + 16]
                result = segmenter(bboxes=[d["bbox"] for d in batch])[0]
                if result.masks is None or len(result.masks.xy) != len(batch):
                    raise RuntimeError("SAM did not produce the requested masks")
                for d, contour in zip(batch, result.masks.xy, strict=True):
                    contour = np.clip(contour, [0, 0], dims - 1).astype(np.float32)
                    if len(contour) < 3 or cv2.contourArea(contour) < 4:
                        continue
                    color, agreement = color_sample(hsv, contour.round().astype(np.int32))
                    center = cv2.moments(contour)
                    cx = center["m10"] / center["m00"] / dims[0]
                    cy = center["m01"] / center["m00"] / dims[1]
                    box = np.clip(np.array(d["bbox"]) / np.tile(dims, 2), 0, 1)
                    holds.append({"id": f"h{len(holds) + 1}", "x": round(float(cx), 5),
                                  "y": round(float(cy), 5), "bbox": box.round(5).tolist(),
                                  "polygon": (contour / dims).astype(float).round(5).tolist(),
                                  "color": color, "colorAgreement": agreement,
                                  "confidence": d["confidence"]})
            segmenter.reset_image()
    return {"video": info, "holds": holds}


def track_pose(source: Path, models_dir: Path) -> dict:
    import mediapipe as mp

    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(weight(models_dir, "pose_landmarker_heavy.task")),
                                          delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.VIDEO, num_poses=1)
    frames = []
    with capture(source) as cap, mp.tasks.vision.PoseLandmarker.create_from_options(options) as pose:
        info = video_info(cap)
        reference = None
        for index in range(info["frameCount"]):
            ok, frame = cap.read()
            if not ok:
                raise RuntimeError("Normalized video ended early during pose tracking")
            if index % 3:
                continue
            if index == 0:
                reference = CameraReference(frame)
            if index % 15 == 0:
                camera = reference.assess(frame)
            t = index / info["fps"]
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            result = pose.detect_for_video(image, round(t * 1000))
            points = [[round(p.x, 5), round(p.y, 5), round(p.visibility, 4), round(p.presence, 4)]
                      for p in result.pose_landmarks[0]] if result.pose_landmarks else []
            frames.append({"t": round(t, 5), "keypoints": points, "camera": camera})
    return {"video": info, "sampleFps": 10, "frames": frames}
