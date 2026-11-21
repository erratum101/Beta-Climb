"""Local stage boundary. The worker owns scheduling and artifact storage."""

import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from .media import VideoRejected, prepare_video

__all__ = ["DEPENDENCIES", "VideoRejected", "run_stage"]

DEPENDENCIES = {
    "prepare_video": (),
    "detect_holds": ("prepare_video",),
    "segment_holds": ("detect_holds",),
    "track_pose": ("prepare_video",),
    "match_contacts": ("segment_holds", "track_pose"),
    "infer_route": ("segment_holds", "match_contacts"),
    "find_episodes": ("segment_holds", "track_pose", "match_contacts", "infer_route"),
}


def run_stage(stage: str, source: Path, inputs: dict[str, Path], output: Path, models_dir: Path) -> None:
    """Write a normalized MP4 and its JPEG cover, or a JSON analysis artifact."""
    if stage not in DEPENDENCIES:
        raise ValueError(f"Unknown video stage {stage}")
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, suffix=".mp4" if stage == "prepare_video" else ".json",
                            delete=False) as file:
        temp = Path(file.name)
    try:
        if stage == "prepare_video":
            thumbnail = temp.with_suffix(".jpg")
            try:
                prepare_video(source, temp, thumbnail)
                os.replace(thumbnail, output.with_suffix(".jpg"))
            finally:
                thumbnail.unlink(missing_ok=True)
        else:
            payload = analyze(stage, source, inputs, models_dir)
            temp.write_text(json.dumps({"schemaVersion": 1, **payload}, separators=(",", ":"),
                                       allow_nan=False, ensure_ascii=False), encoding="utf-8")
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)


def analyze(stage: str, source: Path, inputs: dict[str, Path], models_dir: Path) -> dict:
    from .analysis import find_episodes, infer_route, match_contacts
    from .vision import detect_holds, segment_holds, track_pose

    artifacts = {key: json.loads(inputs[key].read_text(encoding="utf-8"))
                 for key in DEPENDENCIES[stage] if key != "prepare_video"}
    match stage:
        case "detect_holds":
            return detect_holds(source, models_dir)
        case "segment_holds":
            return segment_holds(source, artifacts["detect_holds"], models_dir)
        case "track_pose":
            return track_pose(source, models_dir)
        case "match_contacts":
            return match_contacts(artifacts["segment_holds"], artifacts["track_pose"])
        case "infer_route":
            return infer_route(artifacts["segment_holds"], artifacts["match_contacts"])
        case "find_episodes":
            return find_episodes(artifacts["segment_holds"], artifacts["track_pose"],
                                 artifacts["match_contacts"], artifacts["infer_route"])
        case _:
            raise ValueError(f"Unknown JSON analysis stage {stage}")
