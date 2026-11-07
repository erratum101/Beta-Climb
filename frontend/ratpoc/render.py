"""Render saved predictions, separately from the measured inference pipeline."""

import argparse
import json
from pathlib import Path
import subprocess
import time

import cv2
import numpy as np

COLORS = {"lh": (255, 180, 0), "rh": (0, 180, 255), "lf": (255, 0, 200), "rf": (0, 220, 100)}
BONES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24),
         (23, 24), (23, 25), (25, 27), (27, 31), (24, 26), (26, 28), (28, 32)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("result", type=Path)
    args = parser.parse_args()
    started = time.perf_counter()
    data = json.loads(args.result.read_text())
    width, height = data["video"]["width"], data["video"]["height"]
    output = args.result.with_name("preview.mp4")
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
               "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", "10", "-i", "-", "-an",
               "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", str(output)]
    writer = subprocess.Popen(command, stdin=subprocess.PIPE)
    cap = cv2.VideoCapture(data["video"]["path"])
    contours = {h["id"]: np.array(h["polygon"], dtype=np.int32) for h in data["holds"]}
    frames = data["frames"]
    index = 0
    keyframes = []
    try:
        for tick in range(int(np.ceil(data["video"]["duration_s"] * 10))):
            t = tick / 10
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, image = cap.read()
            if not ok:
                raise RuntimeError(f"Cannot decode preview at {t}s")
            while index + 1 < len(frames) and frames[index + 1]["t"] <= t:
                index += 1
            frame = frames[index]
            cv2.polylines(image, list(contours.values()), True, (110, 110, 110), 1)
            points = frame["keypoints"]
            if points:
                for a, b in BONES:
                    if min(points[a][2:]) >= 0.5 and min(points[b][2:]) >= 0.5:
                        cv2.line(image, tuple(map(int, points[a][:2])), tuple(map(int, points[b][:2])), (255, 255, 255), 2)
                for p in points[11:]:
                    if min(p[2:]) >= 0.5:
                        cv2.circle(image, tuple(map(int, p[:2])), 3, (255, 255, 255), -1)
            cv2.rectangle(image, (0, 0), (width, 125), (20, 20, 20), -1)
            cv2.putText(image, f"Beta Climb PoC | {t:.1f}s | tentative contacts", (10, 24), 0, 0.55, (255, 255, 255), 1)
            for row, (limb, observation) in enumerate(frame["limbs"].items()):
                hold = observation["hold_id"]
                if hold is not None:
                    cv2.polylines(image, [contours[hold]], True, COLORS[limb], 3)
                text = f"{limb}: {observation['state']}" + (f" #{hold}" if hold is not None else "")
                cv2.putText(image, text, (10, 46 + row * 22), 0, 0.5, COLORS[limb], 1)
            writer.stdin.write(image.tobytes())
            if tick in [100, 200, 300]:
                keyframes.append(image.copy())
        writer.stdin.close()
        if writer.wait() != 0:
            raise RuntimeError("FFmpeg failed to write preview")
    finally:
        cap.release()
        if writer.poll() is None:
            writer.terminate()
            writer.wait()
    if keyframes:
        cv2.imwrite(str(args.result.with_name("preview.jpg")), np.concatenate(keyframes, axis=1))
    elapsed = time.perf_counter() - started
    args.result.with_name("render_metrics.json").write_text(json.dumps({"render_s": elapsed}, indent=2) + "\n")
    print(f"{output}: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
