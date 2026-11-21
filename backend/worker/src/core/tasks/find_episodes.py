from pathlib import Path

from database.enums import Stage
from core.tasks.settings import FindEpisodesTaskSettings
from core.tasks.video_stage_task import VideoStageTask


class FindEpisodesTask(VideoStageTask):
    stage = Stage.FIND_EPISODES
    inputs = (Stage.SEGMENT_HOLDS, Stage.TRACK_POSE, Stage.MATCH_CONTACTS, Stage.INFER_ROUTE)

    @property
    def _settings(self) -> FindEpisodesTaskSettings:
        return self._context.settings.find_episodes_task

    @classmethod
    def analyze(cls, source: Path, artifacts: dict[Stage, dict], models_dir: Path) -> dict:
        from service.video.analysis import find_episodes

        return find_episodes(artifacts[Stage.SEGMENT_HOLDS], artifacts[Stage.TRACK_POSE],
                             artifacts[Stage.MATCH_CONTACTS], artifacts[Stage.INFER_ROUTE])
