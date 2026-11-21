import asyncio
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, call
from uuid import uuid4

from core.context import AppContext
from core.settings import Settings
from database.enums import Stage
from core.tasks.manager import TasksManager
from core.tasks.match_contacts import MatchContactsTask
from core.tasks.prepare_video import PrepareVideoTask
from core.tasks.stage_task import StageRun
from core.tasks.video_stage_task import RejectedVideo
from database.manager import DBManager
from database.schemas import Task
from service.storage import ObjectStorage


def make_context() -> AppContext:
    db = AsyncMock(spec=DBManager)
    return AppContext(settings=Settings(), db_manager=db, storage=Mock(spec=ObjectStorage), llm=Mock(),
                      tasks_manager=TasksManager(), stage_slots=asyncio.Semaphore(1))


def make_task(stage: Stage, tries: int = 1) -> Task:
    return Task(uuid4(), uuid4(), stage, uuid4(), tries, "source", {})


class PublicationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.context = make_context()
        self.db, self.storage = self.context.db_manager, self.context.storage
        self.stage = PrepareVideoTask(self.context)
        self.task = make_task(Stage.PREPARE_VIDEO)
        self.run = StageRun(self.task, Path("."), {}, {}, Path("result.mp4"))
        prefix = f"betaclimb/{self.task.video_id}/runs/{self.task.lease_token}"
        self.video, self.cover = f"{prefix}/prepare_video.mp4", f"{prefix}/thumbnail.jpg"

    async def test_lease_loss_discards_both_objects_from_this_attempt(self):
        self.db.finish_prepare_video.return_value = False
        await self.stage._publish(self.run)
        self.assertEqual(self.storage.upload.call_args_list,
                         [call(Path("result.mp4"), self.video), call(Path("result.jpg"), self.cover)])
        self.db.finish_prepare_video.assert_awaited_once_with(
            self.task, self.video, thumbnail_key=self.cover,
            next_stages=[stage for stage in Stage if stage != Stage.PREPARE_VIDEO])
        self.assertEqual(self.storage.delete.call_args_list, [call(self.video), call(self.cover)])

    async def test_failed_cover_upload_discards_unpublished_objects(self):
        self.storage.upload.side_effect = [None, OSError("upload interrupted")]
        with self.assertRaises(OSError):
            await self.stage._publish(self.run)
        self.db.finish_prepare_video.assert_not_awaited()
        self.assertEqual(self.storage.delete.call_args_list, [call(self.video), call(self.cover)])

    def test_thumbnail_upload_sets_jpeg_content_type(self):
        storage = object.__new__(ObjectStorage)
        storage.client = Mock()
        storage.bucket = "test-bucket"
        storage.upload(Path("result.jpg"), self.cover)
        storage.client.upload_file.assert_called_once_with(
            "result.jpg", "test-bucket", self.cover, ExtraArgs={"ContentType": "image/jpeg"})


class StageTaskTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.context = make_context()
        self.db, self.storage = self.context.db_manager, self.context.storage
        self.stage = MatchContactsTask(self.context)
        self.task = make_task(Stage.MATCH_CONTACTS)
        self.db.claim.return_value = self.task
        self.db.artifacts.return_value = {"segment_holds": "masks-key", "track_pose": "pose-key"}
        self.db.finish.return_value = True
        self.result = f"betaclimb/{self.task.video_id}/runs/{self.task.lease_token}/match_contacts.json"

    async def test_iteration_claims_own_stage_downloads_inputs_and_publishes(self):
        async def compute(run):
            self.assertEqual(set(run.inputs), {Stage.SEGMENT_HOLDS, Stage.TRACK_POSE})
            run.output.write_text("{}")

        self.stage._compute = compute
        self.assertEqual(await self.stage.run_iteration(), (True, True))
        self.db.claim.assert_awaited_once_with(Stage.MATCH_CONTACTS, (Stage.SEGMENT_HOLDS, Stage.TRACK_POSE))
        self.assertEqual([args.args[0] for args in self.storage.download.call_args_list], ["masks-key", "pose-key"])
        self.assertEqual(self.storage.upload.call_args.args[1], self.result)
        self.db.finish.assert_awaited_once_with(self.task, self.result)
        self.db.fail.assert_not_awaited()

    async def test_empty_or_unavailable_queue_ends_the_run_until_next_period(self):
        self.db.claim.return_value = None
        self.assertEqual(await self.stage.run_iteration(), (False, True))
        self.db.claim.side_effect = ConnectionError("down")
        self.assertEqual(await self.stage.run_iteration(), (False, False))

    async def test_errors_are_recorded_by_kind(self):
        for error, expected in ((RejectedVideo("too dark"), call(self.task, "too dark", rejected=True)),
                                (RuntimeError("boom"), call(self.task, "Не удалось обработать этот этап."))):
            with self.subTest(error=type(error).__name__):
                self.db.fail.reset_mock()
                self.stage._compute = AsyncMock(side_effect=error)
                self.assertEqual(await self.stage.run_iteration(), (True, False))
                self.assertEqual(self.db.fail.await_args_list, [expected])
        self.db.finish.assert_not_awaited()

    async def test_exhausted_attempts_fail_without_computing(self):
        self.db.claim.return_value = make_task(Stage.MATCH_CONTACTS, tries=4)
        self.stage._compute = AsyncMock()
        self.assertEqual(await self.stage.run_iteration(), (True, False))
        self.stage._compute.assert_not_awaited()
        self.assertFalse(self.db.fail.await_args.kwargs["retryable"])

    async def test_stop_releases_the_row_in_flight(self):
        started = asyncio.Event()

        async def compute(run):
            started.set()
            await asyncio.sleep(999)

        self.stage._compute = compute
        await self.stage.start()
        await started.wait()
        await self.stage.stop()
        self.db.release.assert_awaited_once_with(self.task)
        self.db.fail.assert_not_awaited()
