from pathlib import Path

from database.enums import Stage
from core.tasks.settings import DetectHoldsTaskSettings
from core.tasks.video_stage_task import VideoStageTask


class DetectHoldsTask(VideoStageTask):
    stage = Stage.DETECT_HOLDS
    needs_video = True

    @property
    def _settings(self) -> DetectHoldsTaskSettings:
        return self._context.settings.detect_holds_task

    @classmethod
    def analyze(cls, source: Path, artifacts: dict[Stage, dict], models_dir: Path) -> dict:
        from service.video.vision import detect_holds

        return detect_holds(source, models_dir)
