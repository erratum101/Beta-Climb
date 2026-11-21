import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

from service.video import VideoRejected, run_stage
from service.video.analysis import find_episodes, infer_route, match_contacts
from service.video.vision import CameraReference


class VideoAnalysisTests(unittest.TestCase):
    def setUp(self):
        info = {"width": 100, "height": 100, "durationSec": 0.9, "fps": 30, "frameCount": 27}
        points = [[0.5, 0.5, 1, 1] for _ in range(33)]
        for index in (11, 12):
            points[index][1] = 0.3
        self.wall = {"video": info, "holds": [{"id": "h1", "color": "green",
                      "polygon": [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]}]}
        self.pose = {"video": info, "sampleFps": 10, "frames": [
            {"t": i / 10, "keypoints": points, "camera": {"state": "aligned"}} for i in range(9)]}

    def test_camera_displacement_breaks_a_contact_even_across_a_short_gap(self):
        aligned = match_contacts(self.wall, self.pose)
        self.assertTrue(aligned["events"])
        self.pose["frames"][4]["camera"]["state"] = "shifted"
        result = match_contacts(self.wall, self.pose)
        self.assertEqual(result["frames"][4]["limbs"]["leftHand"]["state"], "mapUnavailable")
        self.assertEqual(result["events"], [])

    def test_low_landmark_visibility_is_reported_without_dropping_the_contact(self):
        for frame in self.pose["frames"]:
            frame["keypoints"] = [list(p) for p in frame["keypoints"]]
            for index in (15, 19):
                frame["keypoints"][index][2] = 0.05
        events = match_contacts(self.wall, self.pose)["events"]
        left = next(e for e in events if e["observations"]["limb"] == "leftHand")
        right = next(e for e in events if e["observations"]["limb"] == "rightHand")
        self.assertEqual(left["observations"]["lowVisibilitySec"], left["observations"]["observedSec"])
        self.assertEqual(right["observations"]["lowVisibilitySec"], 0)

    def test_limb_passing_over_a_hold_is_not_a_contact(self):
        for i, frame in enumerate(self.pose["frames"]):
            frame["keypoints"] = [list(p) for p in frame["keypoints"]]
            for index in (15, 19):
                frame["keypoints"][index][0] = 0.42 + 0.02 * i
        result = match_contacts(self.wall, self.pose)
        self.assertEqual(result["frames"][4]["limbs"]["leftHand"]["state"], "moving")
        self.assertNotIn("leftHand", {e["observations"]["limb"] for e in result["events"]})

    def test_supported_route_colour_removes_neighbouring_holds_from_matching(self):
        info = {"width": 400, "height": 600, "durationSec": 12.0, "fps": 30, "frameCount": 360}
        holds, frames = [], []
        for i in range(6):
            for j in range(12):
                x, y = 0.1 + j * 0.06, (i + 1) / 7
                holds.append({"id": f"h{i}-{j}", "x": x, "y": y, "color": "green" if j == 0 else "yellow",
                              "polygon": [[x - .02, y - .01], [x + .02, y - .01], [x + .02, y + .01], [x - .02, y + .01]]})
        for step in range(120):
            row = step // 20
            points = [[0.5, 0.5, 1, 1] for _ in range(33)]
            for index in (11, 12):
                points[index][1] = 0.3
            # The left hand rests on the green hold of each row. The right foot stays on a yellow neighbour.
            for index in (15, 19):
                points[index][:2] = [0.1, (row + 1) / 7]
            points[32][:2] = [0.16, 1 / 7]
            frames.append({"t": step / 10, "keypoints": points, "camera": {"state": "aligned"}})
        result = match_contacts({"video": info, "holds": holds}, {"video": info, "sampleFps": 10, "frames": frames})
        self.assertEqual((result["holdScope"], result["route"]["color"]), ("route", "green"))
        self.assertEqual({e["observations"]["holdId"] for e in result["events"]}, {f"h{i}-0" for i in range(6)})
        self.assertEqual(infer_route({}, result), result["route"])

    def test_missing_pose_is_a_time_addressable_window_without_advice(self):
        for f in self.pose["frames"]:
            f["keypoints"] = []
        matched = match_contacts(self.wall, self.pose)
        route = infer_route(self.wall, matched)
        evidence = find_episodes(self.wall, self.pose, matched, route)
        window = next(e for e in evidence["events"] if e["type"] == "movementWindow")
        self.assertEqual((window["id"], window["startSec"], window["endSec"]), ("window-1", 0, 0.9))
        self.assertFalse(window["usableForAdvice"])
        self.assertEqual(route["status"], "unknown")
        self.assertTrue(evidence["limitations"])

    def test_full_timeline_can_be_rebuilt_without_access_to_the_video(self):
        matched = match_contacts(self.wall, self.pose)
        with tempfile.TemporaryDirectory() as root:
            tmp = Path(root)
            artifacts = {"segment_holds": self.wall, "track_pose": self.pose, "match_contacts": matched,
                         "infer_route": infer_route(self.wall, matched)}
            paths = {name: tmp / name for name in artifacts}
            for name, data in artifacts.items():
                paths[name].write_text(json.dumps(data))
            output = tmp / "report.json"
            run_stage("find_episodes", tmp / "absent-video.mp4", paths, output, tmp)
            events = json.loads(output.read_text())["events"]
            self.assertFalse(events[0]["usableForAdvice"])
            self.assertTrue(any(e["type"] == "movementWindow" and e["usableForAdvice"] for e in events))
            self.assertEqual(len({e["id"] for e in events}), len(events))

    def test_camera_quality_distinguishes_motion_and_missing_texture(self):
        frame = np.random.default_rng(2026).integers(0, 256, (300, 400, 3), dtype=np.uint8)
        reference = CameraReference(frame)
        self.assertEqual(reference.assess(frame)["state"], "aligned")
        self.assertEqual(reference.assess(np.roll(frame, 40, axis=1))["state"], "shifted")
        self.assertEqual(reference.assess(np.zeros_like(frame))["state"], "unverified")

    def test_route_color_repeats_above_local_background_across_time(self):
        wall = {"video": {"width": 400, "height": 600}, "holds": []}
        events = []
        for i in range(4):
            for j in range(12):
                wall["holds"].append({"id": f"h{i}-{j}", "x": 0.2 + j / 100,
                                      "y": (i + 1) / 5, "color": "green" if j == 0 else "yellow"})
            events.append({"startSec": 2 * i, "observations": {"holdId": f"h{i}-0"}})
        result = infer_route(wall, {"events": events})
        self.assertEqual(result["color"], "green")
        self.assertEqual(result["colorEvidence"]["green"]["observedByHalf"], [2, 2])
        self.assertEqual(len(result["supportHoldIds"]), 4)
        # The four green holds now occur in a single half, followed by an unrelated hold.
        events.append({"startSec": 20, "observations": {"holdId": "h3-1"}})
        self.assertIsNone(infer_route(wall, {"events": events})["color"])
        # Every contact matches yellow on a yellow-only wall; local color gives no discrimination.
        for h in wall["holds"]:
            h["color"] = "yellow"
        self.assertIsNone(infer_route(wall, {"events": events})["color"])

    def test_long_video_is_rejected_before_replacing_a_previous_artifact(self):
        with tempfile.TemporaryDirectory() as root:
            tmp = Path(root)
            source, output = tmp / "source.mp4", tmp / "normalized.mp4"
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                            "color=c=gray:size=16x16:rate=1:duration=61", "-c:v", "libx264",
                            str(source)], check=True)
            output.write_bytes(b"previous artifact")
            output.with_suffix(".jpg").write_bytes(b"previous cover")
            with self.assertRaises(VideoRejected):
                run_stage("prepare_video", source, {}, output, tmp)
            self.assertEqual(output.read_bytes(), b"previous artifact")
            self.assertEqual(output.with_suffix(".jpg").read_bytes(), b"previous cover")

    def test_thumbnail_is_the_first_playback_frame_and_preserves_aspect_ratio(self):
        import cv2
        for source_size, expected_size in (("360x720", (480, 240)), ("96x64", (64, 96))):
            with self.subTest(source_size=source_size), tempfile.TemporaryDirectory() as directory:
                tmp = Path(directory)
                source, output = tmp / "input.mp4", tmp / "prepared.mp4"
                subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                                f"color=c=red:size={source_size}:rate=30:duration=0.2",
                                "-vf", "drawbox=color=blue:t=fill:enable='gt(n,0)'",
                                "-c:v", "libx264", str(source)], check=True)
                run_stage("prepare_video", source, {}, output, tmp)
                cover = output.with_suffix(".jpg")
                self.assertTrue(cover.read_bytes().startswith(b"\xff\xd8\xff"))
                frame = cv2.imread(str(cover))
                self.assertEqual(frame.shape[:2], expected_size)
                self.assertTrue(np.allclose(frame[0, 0], [0, 0, 255], atol=8))


if __name__ == "__main__":
    unittest.main()
