from pathlib import Path

from database.enums import Stage
from core.tasks.settings import InferRouteTaskSettings
from core.tasks.video_stage_task import VideoStageTask


class InferRouteTask(VideoStageTask):
    stage = Stage.INFER_ROUTE
    inputs = (Stage.SEGMENT_HOLDS, Stage.MATCH_CONTACTS)

    @property
    def _settings(self) -> InferRouteTaskSettings:
        return self._context.settings.infer_route_task

    @classmethod
    def analyze(cls, source: Path, artifacts: dict[Stage, dict], models_dir: Path) -> dict:
        from service.video.analysis import infer_route

        return infer_route(artifacts[Stage.SEGMENT_HOLDS], artifacts[Stage.MATCH_CONTACTS])
