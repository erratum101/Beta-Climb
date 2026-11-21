from pathlib import Path

from database.enums import Stage
from core.tasks.settings import MatchContactsTaskSettings
from core.tasks.video_stage_task import VideoStageTask


class MatchContactsTask(VideoStageTask):
    stage = Stage.MATCH_CONTACTS
    inputs = (Stage.SEGMENT_HOLDS, Stage.TRACK_POSE)

    @property
    def _settings(self) -> MatchContactsTaskSettings:
        return self._context.settings.match_contacts_task

    @classmethod
    def analyze(cls, source: Path, artifacts: dict[Stage, dict], models_dir: Path) -> dict:
        from service.video.analysis import match_contacts

        return match_contacts(artifacts[Stage.SEGMENT_HOLDS], artifacts[Stage.TRACK_POSE])
