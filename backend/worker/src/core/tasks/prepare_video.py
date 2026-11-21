from pathlib import Path

from database.enums import Stage
from core.tasks.settings import PrepareVideoTaskSettings
from core.tasks.stage_task import StageRun
from core.tasks.video_stage_task import VideoStageTask
from service.video import save_prepared_video


class PrepareVideoTask(VideoStageTask):
    """Normalizes the upload and opens the rest of the run: the API only enqueues this stage."""

    stage = Stage.PREPARE_VIDEO
    needs_video = True
    output_suffix = ".mp4"

    @property
    def _settings(self) -> PrepareVideoTaskSettings:
        return self._context.settings.prepare_video_task

    @classmethod
    def run(cls, source: Path, inputs: dict[str, Path], output: Path, models_dir: Path) -> None:
        save_prepared_video(source, output)

    def _video_key(self, run: StageRun) -> str:
        return run.task.url

    def _files(self, run: StageRun) -> dict[str, Path]:
        return {**super()._files(run), self._key(run.task, "thumbnail.jpg"): run.output.with_suffix(".jpg")}

    async def _finish(self, run: StageRun) -> bool:
        return await self._context.db_manager.finish_prepare_video(
            run.task,
            self._result_key(run.task),
            thumbnail_key=self._key(run.task, "thumbnail.jpg"),
            next_stages=[stage for stage in Stage if stage != self.stage],
        )
