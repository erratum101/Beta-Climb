"""One pipeline stage as a periodic task: claim a ready row, hold its lease, compute, publish the artifact."""

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TYPE_CHECKING, Any, ClassVar

from database.enums import Stage
from core.tasks.interval_task import IntervalTask
from core.tasks.settings import StageTaskSettings
from database.schemas import Task

if TYPE_CHECKING:
    from core.context import AppContext

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StageRun:
    task: Task
    folder: Path
    artifacts: dict[str, str]  # storage keys of the stages this video has already finished
    inputs: dict[Stage, Path]  # downloaded JSON artifacts of the stages this task depends on
    output: Path


class StageTask(IntervalTask["AppContext"], ABC):
    stage: ClassVar[Stage]
    # Stages whose JSON artifacts this one reads. A row becomes ready once all of them have succeeded.
    inputs: ClassVar[tuple[Stage, ...]] = ()
    output_suffix: ClassVar[str] = ".json"

    @property
    @abstractmethod
    def _settings(self) -> StageTaskSettings:
        raise NotImplementedError

    @abstractmethod
    async def _compute(self, run: StageRun) -> None:
        """Write the result of the stage to run.output."""
        raise NotImplementedError

    async def _run_iteration(self, **kwargs: Any) -> tuple[bool, bool]:  # [is_next_execution_expected, is_succeed]
        async with self._context.stage_slots:
            try:
                task = await self._context.db_manager.claim(self.stage, self.inputs)
            except Exception as exc:
                logger.error("stage=%s queue unavailable: %s", self.stage, type(exc).__name__)
                return False, False
            if task is None:
                return False, True
            return True, await self._handle(task)

    async def _handle(self, task: Task) -> bool:
        db = self._context.db_manager
        if task.tries > self._context.settings.queue.max_tries:
            await db.fail(task, "Не удалось завершить этап после нескольких попыток.", retryable=False)
            return False

        logger.info("stage=%s video=%s attempt=%d", task.type, task.video_id, task.tries)
        try:
            with TemporaryDirectory(prefix="betaclimb-") as directory:
                return await self._supervise(task, Path(directory))
        except asyncio.CancelledError:
            # The worker is stopping. Hand the row back so the interruption does not cost an attempt.
            try:
                await asyncio.shield(db.release(task))
            except Exception as exc:
                logger.warning("stage=%s video=%s could not release: %s", task.type, task.video_id,
                               type(exc).__name__)
            raise

    async def _supervise(self, task: Task, folder: Path) -> bool:
        work = asyncio.create_task(self._process(task, folder))
        renewal = asyncio.create_task(self._renew(task))
        try:
            done, _ = await asyncio.wait((work, renewal), return_when=asyncio.FIRST_COMPLETED)
            for job in done:
                job.result()
            return work in done
        except Exception as exc:
            await self._handle_error(task, exc)
            return False
        finally:
            for job in (work, renewal):
                job.cancel()
            await asyncio.gather(work, renewal, return_exceptions=True)

    async def _handle_error(self, task: Task, error: Exception) -> None:
        logger.error("stage=%s video=%s error_type=%s", task.type, task.video_id, type(error).__name__)
        await self._context.db_manager.fail(task, "Не удалось обработать этот этап.")

    async def _renew(self, task: Task) -> None:
        db = self._context.db_manager
        while True:
            await asyncio.sleep(self._context.settings.queue.heartbeat_period)
            if not await db.heartbeat(task):
                return

    async def _process(self, task: Task, folder: Path) -> None:
        artifacts = await self._context.db_manager.artifacts(task)
        inputs = {}
        for stage in self.inputs:
            inputs[stage] = folder / f"{stage}.json"
            await asyncio.to_thread(self._context.storage.download, artifacts[stage], inputs[stage])

        run = StageRun(task, folder, artifacts, inputs, folder / f"result{self.output_suffix}")
        await self._compute(run)
        # S3 uploads run in threads. Keep the files alive until publication or cleanup
        # finishes, even when the heartbeat reports a lost lease during an upload.
        publication = asyncio.create_task(self._publish(run))
        try:
            await asyncio.shield(publication)
        except asyncio.CancelledError:
            await publication
            raise

    def _key(self, task: Task, name: str) -> str:
        return f"betaclimb/{task.video_id}/runs/{task.lease_token}/{name}"

    def _result_key(self, task: Task) -> str:
        return self._key(task, f"{self.stage}{self.output_suffix}")

    def _files(self, run: StageRun) -> dict[str, Path]:
        """Objects of this attempt by storage key."""
        return {self._result_key(run.task): run.output}

    async def _finish(self, run: StageRun) -> bool:
        """Record the result in the database. False means the lease was lost."""
        return await self._context.db_manager.finish(run.task, self._result_key(run.task))

    async def _publish(self, run: StageRun) -> None:
        files = self._files(run)
        try:
            for key, path in files.items():
                await asyncio.to_thread(self._context.storage.upload, path, key)
        except Exception:
            await self._discard(files)
            raise
        # A database connection error can leave the commit outcome unknown.
        # Only discard uploaded objects after a definite rejection.
        if not await self._finish(run):
            await self._discard(files)

    async def _discard(self, files: dict[str, Path]) -> None:
        for key in files:
            try:
                await asyncio.to_thread(self._context.storage.delete, key)
            except Exception as exc:
                logger.warning("Could not discard unpublished object %s: %s", key, type(exc).__name__)
