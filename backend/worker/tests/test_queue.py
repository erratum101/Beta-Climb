"""Queue integration tests. Set BETA_TEST_DATABASE_URL to a disposable PostgreSQL database."""

import asyncio
import os
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import psycopg
from psycopg import sql
from sqlalchemy import inspect, make_url, select

from core.tasks.build_feedback import BuildFeedbackTask
from core.tasks.detect_holds import DetectHoldsTask
from core.tasks.find_episodes import FindEpisodesTask
from core.tasks.infer_route import InferRouteTask
from core.tasks.match_contacts import MatchContactsTask
from core.tasks.prepare_video import PrepareVideoTask
from core.tasks.segment_holds import SegmentHoldsTask
from core.tasks.track_pose import TrackPoseTask
from database.enums import Stage, VideoStatus
from database.manager import DBManager
from database.settings import DBSettings
from database.models import AthleteProfileModel, Base, TaskModel, VideoAnalysisCommentModel, VideoModel


MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"
STAGE_TASKS = (PrepareVideoTask, DetectHoldsTask, SegmentHoldsTask, TrackPoseTask, MatchContactsTask,
               InferRouteTask, FindEpisodesTask, BuildFeedbackTask)
NEXT_STAGES = [stage for stage in Stage if stage != Stage.PREPARE_VIDEO]


class QueueConfigurationTests(unittest.TestCase):
    def test_default_schema_and_explicit_override_match_flyway(self):
        settings = {"DB_URL": "jdbc:postgresql://localhost/test?currentSchema=driver_only&sslmode=require"}
        for override, expected in (({}, "public"), ({"DB_SCHEMA": "betaclimb"}, "betaclimb")):
            with self.subTest(schema=expected), patch.dict(os.environ, settings | override, clear=True), patch(
                "database.connection.create_async_engine"
            ) as create_engine:
                DBManager()
                url = create_engine.call_args.args[0]
                self.assertEqual(dict(url.query), {"sslmode": "require"})
                options = create_engine.call_args.kwargs["connect_args"]["options"].split()
                self.assertIn(f"-csearch_path={expected}", options)


@unittest.skipUnless(os.getenv("BETA_TEST_DATABASE_URL"), "set BETA_TEST_DATABASE_URL to run PostgreSQL tests")
class QueueTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = make_url(os.environ["BETA_TEST_DATABASE_URL"])
        schema = f"queue_test_{uuid4().hex}"
        self.conn = psycopg.connect(url.set(drivername="postgresql").render_as_string(hide_password=False),
                                    autocommit=True)
        self.addCleanup(self.conn.close)
        name = sql.Identifier(schema)
        self.conn.execute(sql.SQL("CREATE SCHEMA {}").format(name))
        self.addCleanup(self.conn.execute, sql.SQL("DROP SCHEMA {} CASCADE").format(name))
        self.conn.execute(sql.SQL("SET search_path TO {}").format(name))
        self.conn.execute("SET TIME ZONE 'UTC'")
        for migration in sorted(MIGRATIONS.glob("V*__*.sql"), key=lambda path: int(path.name[1:].split("__")[0])):
            self.conn.execute(migration.read_text())
        worker_url = url.set(drivername="postgresql+psycopg").update_query_dict({"application_name": schema})
        self.db = DBManager(DBSettings(url=worker_url.render_as_string(hide_password=False), schema_name=schema))
        self.application_name = schema
        self.addAsyncCleanup(self.db.engine.dispose)
        profile_id, self.video = uuid4(), uuid4()
        self.conn.execute("""
            INSERT INTO athlete_profiles (id, nickname, height_cm, weight_kg, age_years, experience, disciplines,
                                          max_grade, gender, consent_accepted)
            VALUES (%s, 'test', 170, 65, 25, 'gt1y', ARRAY['bouldering'], 'amateur', 'female', true)
        """, (profile_id,))
        self.conn.execute("""
            INSERT INTO videos (id, profile_id, url, status, created_at) VALUES (%s, %s, 'source', 'processing', now())
        """, (self.video, profile_id))
        self.conn.execute("""
            INSERT INTO tasks(id, video_id, payload, type, status, next_attempt_at, created_at, updated_at)
            VALUES (%s, %s, '{}', 'prepare_video', 'pending', now(), now(), now())
        """, (uuid4(), self.video))

    async def claim(self, stage=None):
        """Claim like the stage tasks do: each asks only for its own stage and declares its inputs."""
        for task in STAGE_TASKS:
            if stage in (None, task.stage) and (claimed := await self.db.claim(task.stage, task.inputs)):
                return claimed
        return None

    def prepared(self, task, key="prepared.mp4", cover="cover.jpg"):
        return self.db.finish_prepare_video(task, key, thumbnail_key=cover, next_stages=NEXT_STAGES)

    def test_every_stage_has_one_task(self):
        self.assertEqual([task.stage for task in STAGE_TASKS], list(Stage))

    async def test_model_registry_matches_migrated_tables(self):
        models = {mapper.local_table.name: mapper.local_table for mapper in Base.registry.mappers}

        def compare_schema(connection):
            inspector = inspect(connection)
            self.assertEqual(set(models), set(inspector.get_table_names(schema=self.application_name)))
            for name, table in models.items():
                with self.subTest(table=name):
                    columns = inspector.get_columns(name, schema=self.application_name)
                    def signature(type_, nullable, has_default):
                        return type_.compile(dialect=connection.dialect), nullable, has_default
                    self.assertEqual(
                        {c.name: signature(c.type, c.nullable, c.server_default is not None) for c in table.columns},
                        {c["name"]: signature(c["type"], c["nullable"], c["default"] is not None) for c in columns},
                    )
                    indexes = inspector.get_indexes(name, schema=self.application_name)
                    self.assertEqual(
                        {idx.name: list(idx.columns.keys()) for idx in table.indexes},
                        {idx["name"]: idx["column_names"] for idx in indexes if not idx.get("duplicates_constraint")},
                    )

        async with self.db.engine.connect() as connection:
            await connection.run_sync(compare_schema)

    async def test_claim_reads_video_input_and_waits_for_input_stages(self):
        async with self.db.session.begin() as session:
            video = await session.get(VideoModel, self.video)
            profile = await session.get(AthleteProfileModel, video.profile_id)
            video.url = "attempts/uploaded.mp4"
            video.profile_snapshot = {"experience": profile.experience, "disciplines": profile.disciplines}
        self.assertIsNone(await self.db.claim(Stage.DETECT_HOLDS))
        self.assertIsNone(await self.db.claim(Stage.PREPARE_VIDEO, (Stage.DETECT_HOLDS,)))
        claimed = await self.db.claim(Stage.PREPARE_VIDEO)
        self.assertEqual(claimed.url, "attempts/uploaded.mp4")
        self.assertEqual(claimed.profile_snapshot, {"experience": "gt1y", "disciplines": ["bouldering"]})

    async def test_lease_expiration_fences_old_owner(self):
        first = await self.claim()
        self.assertEqual(first.tries, 1)
        self.assertTrue(await self.db.heartbeat(first))
        self.conn.execute("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=%s", (first.id,))
        self.assertFalse(await self.db.heartbeat(first))
        self.assertFalse(await self.prepared(first, "expired-artifact", "expired.jpg"))

        second = await self.claim()
        self.assertEqual(second.id, first.id)
        self.assertEqual(second.tries, 2)
        self.assertNotEqual(first.lease_token, second.lease_token)
        await self.db.fail(first, "expired failure", retryable=False)
        self.assertFalse(await self.prepared(first, "stale-artifact", "stale.jpg"))
        self.assertTrue(await self.db.heartbeat(second))
        self.assertTrue(await self.prepared(second, "normalized.mp4", "normalized.jpg"))
        self.assertFalse(await self.prepared(second, "duplicate.mp4", "duplicate.jpg"))
        self.assertEqual(self.conn.execute("SELECT result_data FROM videos").fetchone()[0],
                         {"playbackKey": "normalized.mp4", "thumbnailKey": "normalized.jpg"})
        self.assertEqual(await self.db.artifacts(second), {"prepare_video": "normalized.mp4"})
        self.assertEqual(self.conn.execute("SELECT count(*) FROM tasks").fetchone()[0], len(Stage))

    async def test_release_returns_the_row_without_spending_an_attempt(self):
        first = await self.claim()
        await self.db.release(first)
        self.assertFalse(await self.db.heartbeat(first))
        second = await self.claim()
        self.assertEqual((second.id, second.tries), (first.id, 1))
        await self.db.release(first)
        self.assertTrue(await self.db.heartbeat(second))

    async def test_parallel_claims_dependency_join_and_single_publication(self):
        claims = await asyncio.gather(self.claim(), self.claim())
        self.assertEqual(sum(task is not None for task in claims), 1)
        root = next(task for task in claims if task is not None)
        self.assertTrue(await self.prepared(root))

        branches = {task.type: task for task in await asyncio.gather(self.claim(Stage.DETECT_HOLDS),
                                                                      self.claim(Stage.TRACK_POSE))}
        self.assertEqual(set(branches), {"detect_holds", "track_pose"})
        self.assertIsNone(await self.claim())
        self.assertTrue(await self.db.finish(branches["detect_holds"], "boxes"))
        masks = await self.claim()
        self.assertEqual(masks.type, "segment_holds")
        self.assertEqual(self.conn.execute("SELECT stage FROM videos").fetchone(), ("movement",))
        self.assertIsNone(await self.claim())
        results = await asyncio.gather(self.db.finish(masks, "masks"), self.db.finish(branches["track_pose"], "pose"))
        self.assertEqual(results, [True, True])
        for expected in ("match_contacts", "infer_route", "find_episodes"):
            task = await self.claim()
            self.assertEqual(task.type, expected)
            self.assertIsNone(await self.claim())
            self.assertTrue(await self.db.finish(task, expected))
            self.assertFalse(await self.db.finish(task, "duplicate"))

        last = await self.claim()
        self.assertEqual(last.type, "build_feedback")
        feedback = {"durationSec": 12, "limitations": [], "moments": [{"timeSec": 4.5, "action": "one"}]}
        outcomes = await asyncio.gather(self.db.finish_build_feedback(last, "feedback-1", feedback),
                                        self.db.finish_build_feedback(last, "feedback-2", feedback))
        self.assertEqual(sorted(outcomes), [False, True])
        self.assertIsNone(await self.claim())
        async with self.db.session() as session:
            video = await session.get(VideoModel, self.video)
            self.assertEqual((video.status, video.stage, video.duration_sec), ("ready", "done", 12))
            self.assertEqual(video.result_data, {"playbackKey": "prepared.mp4", "thumbnailKey": "cover.jpg", **feedback})
            comment = (await session.scalars(select(VideoAnalysisCommentModel))).one()
            self.assertEqual((comment.video_id, comment.profile_id, comment.comment, comment.timecode),
                             (self.video, video.profile_id, "one", timedelta(seconds=4.5)))
        self.assertEqual(self.conn.execute("SELECT count(*), sum(tries) FROM tasks WHERE status='succeeded'").fetchone(),
                         (len(Stage), len(Stage)))

    async def test_retry_backoff_then_terminal_failure_cancels_other_leases(self):
        root = await self.claim()
        await self.prepared(root)
        first, sibling = await asyncio.gather(self.claim(Stage.DETECT_HOLDS), self.claim(Stage.TRACK_POSE))
        await self.db.fail(first, "temporary")
        self.assertIsNone(await self.claim())
        self.conn.execute("UPDATE tasks SET next_attempt_at=now() WHERE id=%s", (first.id,))
        retry = await self.claim()
        self.assertEqual((retry.id, retry.tries), (first.id, 2))
        await self.db.fail(retry, "invalid input", rejected=True)
        self.assertFalse(await self.db.finish(sibling, "late"))
        self.assertFalse(await self.db.heartbeat(sibling))
        self.assertIsNone(await self.claim())
        self.assertEqual(self.conn.execute("SELECT status, stage FROM videos").fetchone(),
                         (VideoStatus.REJECTED, retry.type.video_stage))
        self.assertEqual(self.conn.execute("SELECT status FROM tasks WHERE id=%s", (sibling.id,)).fetchone(),
                         ("cancelled",))

    async def test_concurrent_terminal_failures_do_not_deadlock(self):
        root = await self.claim()
        await self.prepared(root)
        first, second = await asyncio.gather(self.claim(Stage.DETECT_HOLDS), self.claim(Stage.TRACK_POSE))
        # Release both publishers together after they reach the video's row lock.
        with self.conn.transaction():
            self.conn.execute("SELECT id FROM videos WHERE id=%s FOR UPDATE", (self.video,))
            failures = [asyncio.create_task(self.db.fail(task, "unavailable", retryable=False))
                        for task in (first, second)]
            async with asyncio.timeout(5):
                while self.conn.execute("""
                    SELECT count(*) FROM pg_stat_activity
                    WHERE application_name=%s AND wait_event_type='Lock'
                """, (self.application_name,)).fetchone()[0] < 2:
                    self.conn.execute("SELECT pg_stat_clear_snapshot()")
                    await asyncio.sleep(0.01)
        await asyncio.gather(*failures)
        self.assertIsNone(await self.claim())
        failed_type = self.conn.execute("SELECT type FROM tasks WHERE status='failed'").fetchone()[0]
        self.assertEqual(self.conn.execute("SELECT status, stage FROM videos").fetchone(),
                         (VideoStatus.FAILED, Stage(failed_type).video_stage))
        self.assertEqual(self.conn.execute("SELECT count(*) FROM tasks WHERE status='running'").fetchone(), (0,))
