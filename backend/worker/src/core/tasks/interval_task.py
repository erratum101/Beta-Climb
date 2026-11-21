"""Base mechanism for periodic tasks: run iterations until the work runs out, then sleep for a period."""

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class IntervalTaskSettings(BaseModel):
    name: str = "interval_task"
    period: float = 30  # [sec]
    tasks_count: int = 1


class IntervalTask[C](ABC):
    def __init__(self, context: C, **kwargs: Any) -> None:
        self._context = context
        self._asyncio_tasks: list[asyncio.Task[None]] = []
        self._is_stopped = True

    @property
    @abstractmethod
    def _settings(self) -> IntervalTaskSettings:
        raise NotImplementedError

    @property
    def _tasks_count(self) -> int:
        return self._settings.tasks_count

    async def do(self, **kwargs: Any) -> None:
        while not self._is_stopped:
            is_next_execution_expected, _ = await self.run_iteration(**kwargs)
            if not is_next_execution_expected:
                return

    async def run_iteration(self, **kwargs: Any) -> tuple[bool, bool]:
        started_at = time.perf_counter()
        is_next_execution_expected, is_succeed = await self._run_iteration(**kwargs)
        logger.debug("task=%s iteration succeed=%s duration=%.3fs", self._settings.name, is_succeed,
                     time.perf_counter() - started_at)
        return is_next_execution_expected, is_succeed

    @abstractmethod
    async def _run_iteration(self, **kwargs: Any) -> tuple[bool, bool]:  # [is_next_execution_expected, is_succeed]
        raise NotImplementedError

    async def start(self) -> None:
        if self._asyncio_tasks or not self._is_stopped:
            raise RuntimeError("can't start tasks that are already started!")

        self._is_stopped = False
        self._asyncio_tasks = [asyncio.create_task(self._run()) for _ in range(self._tasks_count)]

    async def stop(self) -> None:
        if not self._asyncio_tasks or self._is_stopped:
            raise RuntimeError("can't stop tasks that aren't running!")

        self._is_stopped = True

        for task in self._asyncio_tasks:
            task.cancel()

        await asyncio.wait(self._asyncio_tasks)
        self._asyncio_tasks = []

    async def _run(self) -> None:
        name = self._settings.name
        try:
            while not self._is_stopped:
                try:
                    await self.do()
                except Exception:
                    logger.exception("periodic task %s errored", name)

                await asyncio.sleep(self._settings.period)
        except asyncio.CancelledError:
            logger.info("periodic task %s cancelled", name)
