"""Stages whose body runs in an isolated process."""

import asyncio
import json
import sys
from abc import ABC, abstractmethod
from pathlib import Path
from typing import ClassVar

from database.enums import Stage
from core.tasks.settings import VideoStageTaskSettings
from core.tasks.stage_task import StageRun, StageTask
from database.schemas import Task
from service.video import save_analysis


class RejectedVideo(Exception):
    pass


class VideoStageTask(StageTask, ABC):
    needs_video: ClassVar[bool] = False  # download the video before the stage runs

    @property
    @abstractmethod
    def _settings(self) -> VideoStageTaskSettings:
        raise NotImplementedError

    @classmethod
    def run(cls, source: Path, inputs: dict[str, Path], output: Path, models_dir: Path) -> None:
        """Body of the stage. core.video_process calls it in the isolated process, without the worker's context."""
        artifacts = {Stage(stage): json.loads(path.read_text(encoding="utf-8")) for stage, path in inputs.items()}
        save_analysis(output, cls.analyze(source, artifacts, models_dir))

    @classmethod
    def analyze(cls, source: Path, artifacts: dict[Stage, dict], models_dir: Path) -> dict:
        """Compute the JSON artifact of the stage from the video and the artifacts of its inputs.
        Import service.video modules inside: the worker process itself never loads the vision stack."""
        raise NotImplementedError

    def _video_key(self, run: StageRun) -> str:
        return run.artifacts[Stage.PREPARE_VIDEO]

    async def _compute(self, run: StageRun) -> None:
        source = run.folder / "source.mp4"
        if self.needs_video:
            await asyncio.to_thread(self._context.storage.download, self._video_key(run), source)

        # Native inference can block or terminate the interpreter. Isolate it from polling and lease renewal.
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "core.video_process", type(self).__module__, type(self).__name__,
            str(source), str(run.output),
            str(self._context.settings.models_dir),
            json.dumps({stage: str(path) for stage, path in run.inputs.items()}),
        )
        try:
            async with asyncio.timeout(self._settings.timeout):
                code = await process.wait()
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
        if code == 2:
            # The subprocess writes only a user-facing reason for a supported rejection here.
            raise RejectedVideo(run.output.with_suffix(".reason").read_text())
        if code != 0:
            raise RuntimeError("video stage failed")

    async def _handle_error(self, task: Task, error: Exception) -> None:
        if isinstance(error, RejectedVideo):
            await self._context.db_manager.fail(task, str(error), rejected=True)
            return
        await super()._handle_error(task, error)
