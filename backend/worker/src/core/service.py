"""Lifecycle of a long-running process: start everything, wait for a signal, stop in order."""

import asyncio
import logging
import signal
from collections.abc import Awaitable, Callable, Sequence

logger = logging.getLogger(__name__)

Hook = Callable[[], Awaitable[None]]


class WorkerService:
    def __init__(self, on_startup: Sequence[Hook] = (), on_shutdown: Sequence[Hook] = ()) -> None:
        self._on_startup = list(on_startup)
        self._on_shutdown = list(on_shutdown)

    async def run_forever(self) -> None:
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, stop.set)
        try:
            for hook in self._on_startup:
                await hook()
            await stop.wait()
        finally:
            await self.shutdown()

    async def shutdown(self) -> None:
        for hook in self._on_shutdown:
            try:
                await hook()
            except Exception:
                logger.exception("shutdown hook failed")
