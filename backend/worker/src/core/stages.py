"""Dependencies and display stages of one analysis run."""

from service.video import DEPENDENCIES as VIDEO_DEPENDENCIES

DEPENDENCIES = {**VIDEO_DEPENDENCIES, "build_feedback": ("find_episodes",)}


def display_stage(stage: str) -> str:
    if stage in ("find_episodes", "build_feedback"):
        return "rules"
    if stage in ("track_pose", "match_contacts", "infer_route"):
        return "movement"
    return "holds"
