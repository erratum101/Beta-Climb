from pathlib import Path

from database.enums import Stage
from core.tasks.settings import TrackPoseTaskSettings
from core.tasks.video_stage_task import VideoStageTask


class TrackPoseTask(VideoStageTask):
    stage = Stage.TRACK_POSE
    needs_video = True

    @property
    def _settings(self) -> TrackPoseTaskSettings:
        return self._context.settings.track_pose_task

    @classmethod
    def analyze(cls, source: Path, artifacts: dict[Stage, dict], models_dir: Path) -> dict:
        from service.video.vision import track_pose

        return track_pose(source, models_dir)
