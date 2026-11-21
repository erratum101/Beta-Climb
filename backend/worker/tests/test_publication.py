import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, Mock, call
from uuid import uuid4

from core.worker import Worker
from database.manager import DBManager, Task
from service.storage import ObjectStorage


class PublicationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock(spec=DBManager)
        self.storage = Mock(spec=ObjectStorage)
        self.worker = Worker(self.db, self.storage, Mock(), Path("models"))
        self.task = Task(uuid4(), uuid4(), "prepare_video", uuid4(), 1, "source", {})
        prefix = f"betaclimb/{self.task.video_id}/runs/{self.task.lease_token}"
        self.video, self.cover = f"{prefix}/prepare_video.mp4", f"{prefix}/thumbnail.jpg"

    async def test_lease_loss_discards_both_objects_from_this_attempt(self):
        self.db.finish.return_value = False
        await self.worker.publish(self.task, Path("result.mp4"), None)
        self.assertEqual(self.storage.upload.call_args_list,
                         [call(Path("result.mp4"), self.video), call(Path("result.jpg"), self.cover)])
        self.db.finish.assert_awaited_once_with(self.task, self.video, None, thumbnail_key=self.cover)
        self.assertEqual(self.storage.delete.call_args_list, [call(self.video), call(self.cover)])

    async def test_failed_cover_upload_discards_unpublished_objects(self):
        self.storage.upload.side_effect = [None, OSError("upload interrupted")]
        with self.assertRaises(OSError):
            await self.worker.publish(self.task, Path("result.mp4"), None)
        self.db.finish.assert_not_awaited()
        self.assertEqual(self.storage.delete.call_args_list, [call(self.video), call(self.cover)])

    def test_thumbnail_upload_sets_jpeg_content_type(self):
        with TemporaryDirectory() as directory:
            storage = ObjectStorage(Path(directory))
            source = Path(directory) / "result.jpg"
            source.write_bytes(b"jpeg")
            storage.upload(source, self.cover)
            stored = storage.root / self.cover
            self.assertEqual(stored.read_bytes(), b"jpeg")
            self.assertEqual(stored.with_name(stored.name + ".type").read_text(encoding="utf-8"), "image/jpeg")
