"""Run with python -m core.worker. Builds the worker's dependencies and starts one periodic task per stage."""

import asyncio
import logging
import os

import httpx
from dotenv import load_dotenv

from core.context import AppContext
from core.service import WorkerService
from core.settings import Settings
from core.tasks.build_feedback import BuildFeedbackTask
from core.tasks.detect_holds import DetectHoldsTask
from core.tasks.find_episodes import FindEpisodesTask
from core.tasks.infer_route import InferRouteTask
from core.tasks.manager import TasksManager
from core.tasks.match_contacts import MatchContactsTask
from core.tasks.prepare_video import PrepareVideoTask
from core.tasks.segment_holds import SegmentHoldsTask
from core.tasks.track_pose import TrackPoseTask
from database.manager import DBManager
from service.llm import ChatClient, ElizaChatClient
from service.storage import ObjectStorage


def load_env_files() -> None:
    """ENV_FILES lists dotenv files separated by the OS path separator. Exported variables win."""
    for path in filter(None, os.getenv("ENV_FILES", "").split(os.pathsep)):
        load_dotenv(path, interpolate=False)


def get_settings() -> Settings:
    return Settings()


def get_db_manager(settings: Settings) -> DBManager:
    return DBManager(settings.db, settings.queue)


def get_storage() -> ObjectStorage:
    return ObjectStorage()


def get_llm_client(http: httpx.AsyncClient) -> ChatClient:
    return ElizaChatClient(http)


def get_context(settings: Settings, http: httpx.AsyncClient) -> AppContext:
    tasks_manager = TasksManager()

    context = AppContext(
        settings=settings,
        db_manager=get_db_manager(settings),
        storage=get_storage(),
        llm=get_llm_client(http),
        tasks_manager=tasks_manager,
        stage_slots=asyncio.Semaphore(settings.concurrency),
    )

    tasks_manager.prepare_video = PrepareVideoTask(context)
    tasks_manager.detect_holds = DetectHoldsTask(context)
    tasks_manager.segment_holds = SegmentHoldsTask(context)
    tasks_manager.track_pose = TrackPoseTask(context)
    tasks_manager.match_contacts = MatchContactsTask(context)
    tasks_manager.infer_route = InferRouteTask(context)
    tasks_manager.find_episodes = FindEpisodesTask(context)
    tasks_manager.build_feedback = BuildFeedbackTask(context)

    return context


def get_worker_service(context: AppContext) -> WorkerService:
    tasks_manager = context.tasks_manager

    on_startup = [
        tasks_manager.prepare_video.start,
        tasks_manager.detect_holds.start,
        tasks_manager.segment_holds.start,
        tasks_manager.track_pose.start,
        tasks_manager.match_contacts.start,
        tasks_manager.infer_route.start,
        tasks_manager.find_episodes.start,
        tasks_manager.build_feedback.start,
    ]

    on_shutdown = [
        tasks_manager.prepare_video.stop,
        tasks_manager.detect_holds.stop,
        tasks_manager.segment_holds.stop,
        tasks_manager.track_pose.stop,
        tasks_manager.match_contacts.stop,
        tasks_manager.infer_route.stop,
        tasks_manager.find_episodes.stop,
        tasks_manager.build_feedback.stop,
    ]

    return WorkerService(on_startup=on_startup, on_shutdown=on_shutdown)


async def run_service() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    load_env_files()
    settings = get_settings()

    async with httpx.AsyncClient() as http:
        context = get_context(settings, http)
        try:
            await get_worker_service(context).run_forever()
        finally:
            await context.db_manager.engine.dispose()


def main() -> None:
    asyncio.run(run_service())


if __name__ == "__main__":
    main()
