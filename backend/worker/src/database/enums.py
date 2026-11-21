"""Values of the text columns shared with the API."""

from enum import StrEnum


class TaskStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class VideoStatus(StrEnum):
    PROCESSING = "processing"
    READY = "ready"
    LIMITED = "limited"  # analysed, but the recording limits what can be said
    REJECTED = "rejected"
    FAILED = "failed"


class VideoStage(StrEnum):
    """Coarse progress of a video shown to the user."""

    HOLDS = "holds"
    MOVEMENT = "movement"
    RULES = "rules"
    DONE = "done"


class Stage(StrEnum):
    """Type of a task: one step of the analysis of a video."""

    PREPARE_VIDEO = "prepare_video"
    DETECT_HOLDS = "detect_holds"
    SEGMENT_HOLDS = "segment_holds"
    TRACK_POSE = "track_pose"
    MATCH_CONTACTS = "match_contacts"
    INFER_ROUTE = "infer_route"
    FIND_EPISODES = "find_episodes"
    BUILD_FEEDBACK = "build_feedback"

    @property
    def video_stage(self) -> VideoStage:
        if self in (Stage.FIND_EPISODES, Stage.BUILD_FEEDBACK):
            return VideoStage.RULES
        if self in (Stage.TRACK_POSE, Stage.MATCH_CONTACTS, Stage.INFER_ROUTE):
            return VideoStage.MOVEMENT
        return VideoStage.HOLDS
