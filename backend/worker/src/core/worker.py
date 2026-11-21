"""Run with python -m core.worker. Each iteration handles one durable stage."""

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
from dotenv import load_dotenv

from core.stages import DEPENDENCIES
from database.manager import DBManager, Task
from service.feedback import build_feedback
from service.llm import ChatClient, DeepSeekChatClient, LLMError
from service.storage import ObjectStorage

LOG = logging.getLogger("betaclimb.worker")


class RejectedVideo(Exception):
    pass


async def compute_stage(task: Task, source: Path, inputs: dict[str, Path], output: Path, models: Path) -> None:
    # Native inference can block or terminate the interpreter. Isolate it from polling and lease renewal.
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "core.video_process", task.type, str(source), str(output), str(models),
        json.dumps({name: str(path) for name, path in inputs.items()}),
    )
    try:
        async with asyncio.timeout(600):
            code = await process.wait()
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
    if code == 2:
        # The subprocess writes only a user-facing reason for a supported rejection here.
        raise RejectedVideo(output.with_suffix(".reason").read_text())
    if code != 0:
        raise RuntimeError("video stage failed")


class Worker:
    def __init__(self, db: DBManager, storage: ObjectStorage, llm: ChatClient, models: Path):
        self.db = db
        self.storage = storage
        self.llm = llm
        self.models = models

    async def process(self, task: Task, folder: Path) -> None:
        artifacts = await self.db.artifacts(task)
        inputs = {}
        for dependency in DEPENDENCIES[task.type]:
            if dependency == "prepare_video":
                continue
            inputs[dependency] = folder / f"{dependency}.json"
            await asyncio.to_thread(self.storage.download, artifacts[dependency], inputs[dependency])

        extension = "mp4" if task.type == "prepare_video" else "json"
        output = folder / f"result.{extension}"
        feedback = None
        if task.type == "build_feedback":
            timeline = json.loads(inputs["find_episodes"].read_bytes())
            feedback = await build_feedback(timeline, task.profile_snapshot, self.llm)
            output.write_text(json.dumps(feedback, ensure_ascii=False))
        else:
            source = folder / "source.mp4"
            if task.type in {"prepare_video", "detect_holds", "segment_holds", "track_pose"}:
                source_key = task.url if task.type == "prepare_video" else artifacts["prepare_video"]
                await asyncio.to_thread(self.storage.download, source_key, source)
            await compute_stage(task, source, inputs, output, self.models)
        # S3 uploads run in threads. Keep the files alive until publication or cleanup
        # finishes, even when the heartbeat reports a lost lease during an upload.
        publication = asyncio.create_task(self.publish(task, output, feedback))
        try:
            await asyncio.shield(publication)
        except asyncio.CancelledError:
            await publication
            raise

    async def publish(self, task: Task, output: Path, feedback: dict | None) -> None:
        prefix = f"betaclimb/{task.video_id}/runs/{task.lease_token}"
        result_key = f"{prefix}/{task.type}{output.suffix}"
        files = {result_key: output}
        thumbnail_key = None
        if task.type == "prepare_video":
            thumbnail_key = f"{prefix}/thumbnail.jpg"
            files[thumbnail_key] = output.with_suffix(".jpg")

        try:
            for key, path in files.items():
                await asyncio.to_thread(self.storage.upload, path, key)
        except Exception:
            await self.discard(files)
            raise
        # A database connection error can leave the commit outcome unknown.
        # Only discard uploaded objects after a definite rejection.
        if not await self.db.finish(task, result_key, feedback, thumbnail_key=thumbnail_key):
            await self.discard(files)

    async def discard(self, files: dict[str, Path]) -> None:
        for key in files:
            try:
                await asyncio.to_thread(self.storage.delete, key)
            except Exception as exc:
                LOG.warning("Could not discard unpublished object %s: %s", key, type(exc).__name__)

    async def renew(self, task: Task) -> None:
        while True:
            await asyncio.sleep(self.db.lease_seconds / 3)
            if not await self.db.heartbeat(task):
                return

    async def handle(self, task: Task) -> None:
        if task.tries > self.db.max_tries:
            await self.db.fail(task, "Не удалось завершить этап после нескольких попыток.", retryable=False)
            return
        LOG.info("stage=%s video=%s attempt=%d", task.type, task.video_id, task.tries)
        with TemporaryDirectory(prefix="betaclimb-") as directory:
            work = asyncio.create_task(self.process(task, Path(directory)))
            renewal = asyncio.create_task(self.renew(task))
            try:
                done, _ = await asyncio.wait((work, renewal), return_when=asyncio.FIRST_COMPLETED)
                for job in done:
                    job.result()
            except RejectedVideo as exc:
                await self.db.fail(task, str(exc), rejected=True)
            except LLMError as exc:
                LOG.warning("stage=%s video=%s error=%s", task.type, task.video_id, exc)
                await self.db.fail(task, "Не удалось получить разбор от модели.", retryable=exc.retryable)
            except Exception as exc:
                LOG.error("stage=%s video=%s error_type=%s", task.type, task.video_id, type(exc).__name__)
                await self.db.fail(task, "Не удалось обработать этот этап.")
            finally:
                for job in (work, renewal):
                    job.cancel()
                await asyncio.gather(work, renewal, return_exceptions=True)

    async def poll(self, stop: asyncio.Event, once: bool) -> None:
        while not stop.is_set():
            try:
                task = await self.db.claim()
                if task is not None:
                    await self.handle(task)
                elif not once:
                    await asyncio.sleep(1)
            except Exception as exc:
                if once:
                    raise
                LOG.error("queue unavailable: %s", type(exc).__name__)
                await asyncio.sleep(3)
            if once:
                return


async def run(args: argparse.Namespace) -> None:
    db = DBManager()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    try:
        async with httpx.AsyncClient() as http:
            worker = Worker(db, ObjectStorage(), DeepSeekChatClient(http), args.models_dir)
            await asyncio.gather(*(worker.poll(stop, args.once) for _ in range(args.concurrency)))
    finally:
        await db.engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", action="append", default=[], help="Load configuration (repeatable)")
    parser.add_argument("--models-dir", type=Path, default=None)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--once", action="store_true", help="Try one task and exit")
    args = parser.parse_args()
    for path in args.env:
        load_dotenv(path, interpolate=False)
    args.models_dir = args.models_dir or Path(os.getenv("MODELS_DIR", "frontend/ratpoc/assets/models"))
    if args.concurrency < 1:
        parser.error("--concurrency must be positive")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
