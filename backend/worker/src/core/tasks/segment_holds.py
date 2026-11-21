from pathlib import Path

from database.enums import Stage
from core.tasks.settings import SegmentHoldsTaskSettings
from core.tasks.video_stage_task import VideoStageTask


class SegmentHoldsTask(VideoStageTask):
    stage = Stage.SEGMENT_HOLDS
    needs_video = True
    inputs = (Stage.DETECT_HOLDS,)

    @property
    def _settings(self) -> SegmentHoldsTaskSettings:
        return self._context.settings.segment_holds_task

    @classmethod
    def analyze(cls, source: Path, artifacts: dict[Stage, dict], models_dir: Path) -> dict:
        from service.video.vision import segment_holds

        return segment_holds(source, artifacts[Stage.DETECT_HOLDS], models_dir)
