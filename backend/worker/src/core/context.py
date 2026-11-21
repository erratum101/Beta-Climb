import asyncio
from dataclasses import dataclass

from core.settings import Settings
from core.tasks.manager import TasksManager
from database.manager import DBManager
from service.llm import ChatClient
from service.storage import ObjectStorage


@dataclass
class AppContext:
    settings: Settings
    db_manager: DBManager
    storage: ObjectStorage
    llm: ChatClient
    tasks_manager: TasksManager
    # Native inference is memory hungry: every stage task takes a slot before it claims work.
    stage_slots: asyncio.Semaphore
