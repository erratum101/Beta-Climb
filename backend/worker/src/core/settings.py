"""Worker settings. Nested values come from the environment as PREPARE_VIDEO_TASK__PERIOD=2 or QUEUE__LEASE_SECONDS=120."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from database.settings import DBSettings, QueueSettings
from core.tasks.settings import (
    BuildFeedbackTaskSettings,
    DetectHoldsTaskSettings,
    FindEpisodesTaskSettings,
    InferRouteTaskSettings,
    MatchContactsTaskSettings,
    PrepareVideoTaskSettings,
    SegmentHoldsTaskSettings,
    TrackPoseTaskSettings,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_nested_delimiter="__", extra="ignore")

    models_dir: Path = Path("frontend/ratpoc/assets/models")
    concurrency: int = Field(default=1, ge=1)  # stages running in this process at the same time

    db: DBSettings = Field(default_factory=DBSettings)
    queue: QueueSettings = Field(default_factory=QueueSettings)

    prepare_video_task: PrepareVideoTaskSettings = Field(default_factory=PrepareVideoTaskSettings)
    detect_holds_task: DetectHoldsTaskSettings = Field(default_factory=DetectHoldsTaskSettings)
    segment_holds_task: SegmentHoldsTaskSettings = Field(default_factory=SegmentHoldsTaskSettings)
    track_pose_task: TrackPoseTaskSettings = Field(default_factory=TrackPoseTaskSettings)
    match_contacts_task: MatchContactsTaskSettings = Field(default_factory=MatchContactsTaskSettings)
    infer_route_task: InferRouteTaskSettings = Field(default_factory=InferRouteTaskSettings)
    find_episodes_task: FindEpisodesTaskSettings = Field(default_factory=FindEpisodesTaskSettings)
    build_feedback_task: BuildFeedbackTaskSettings = Field(default_factory=BuildFeedbackTaskSettings)
