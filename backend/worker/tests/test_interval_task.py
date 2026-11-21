import asyncio
import unittest
from unittest.mock import AsyncMock

from core.tasks.interval_task import IntervalTask, IntervalTaskSettings


class IntervalTaskForTest(IntervalTask[None]):
    def __init__(self, func, **settings):
        super().__init__(None)
        self._func = func
        self._test_settings = IntervalTaskSettings(name="test", period=0.01, **settings)

    @property
    def _settings(self) -> IntervalTaskSettings:
        return self._test_settings

    async def _run_iteration(self, **kwargs):
        return await self._func(**kwargs)


class IntervalTaskTests(unittest.IsolatedAsyncioTestCase):
    async def test_repeats_after_each_period(self):
        func = AsyncMock(return_value=(False, True))
        task = IntervalTaskForTest(func)
        await task.start()
        await asyncio.sleep(0.1)
        await task.stop()
        self.assertGreater(func.call_count, 1)

    async def test_iterates_without_sleeping_while_work_is_expected(self):
        func = AsyncMock(side_effect=[(True, True), (True, False), (False, True)])
        task = IntervalTaskForTest(func)
        task._is_stopped = False
        await task.do()
        self.assertEqual(func.call_count, 3)

    async def test_error_does_not_stop_the_task(self):
        func = AsyncMock(side_effect=Exception("Test error"))
        task = IntervalTaskForTest(func)
        with self.assertLogs("core.tasks.interval_task", level="ERROR"):
            await task.start()
            await asyncio.sleep(0.1)
            await task.stop()
        self.assertGreater(func.call_count, 1)

    async def test_tasks_count_runs_parallel_loops(self):
        running = 0
        peak = 0

        async def func():
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.05)
            running -= 1
            return False, True

        task = IntervalTaskForTest(func, tasks_count=3)
        await task.start()
        await asyncio.sleep(0.03)
        await task.stop()
        self.assertEqual(peak, 3)

    async def test_start_twice_and_stop_idle_are_errors(self):
        task = IntervalTaskForTest(AsyncMock(return_value=(False, True)))
        with self.assertRaises(RuntimeError):
            await task.stop()
        await task.start()
        with self.assertRaises(RuntimeError):
            await task.start()
        await task.stop()

    async def test_stop_cancels_a_long_iteration_and_allows_restart(self):
        async def func():
            await asyncio.sleep(999)

        task = IntervalTaskForTest(func)
        await task.start()
        await asyncio.sleep(0.01)
        loops = list(task._asyncio_tasks)
        await task.stop()
        self.assertTrue(all(loop.done() for loop in loops))
        await task.start()
        await task.stop()
