"""Durable queue for one video per run. All leases use the PostgreSQL clock."""

import os
import re
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import URL, ColumnElement, Text, and_, column, func, insert, make_url, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import aliased

from core.stages import DEPENDENCIES, display_stage
from database.models import TaskModel, VideoAnalysisCommentModel, VideoModel


@dataclass(frozen=True)
class Task:
    id: UUID
    video_id: UUID
    type: str
    lease_token: UUID
    tries: int
    url: str
    profile_snapshot: dict


def connection_url() -> URL:
    configured = os.getenv("DB_URL") or os.getenv("DATABASE_URL")
    if configured:
        # currentSchema is a JDBC option; psycopg receives search_path on connection.
        url = make_url(configured.removeprefix("jdbc:")).difference_update_query(["currentSchema"])
        url = url.set(drivername="postgresql+psycopg", username=os.getenv("DB_USERNAME") or url.username,
                      password=os.getenv("DB_PASSWORD") or url.password)
    else:
        url = URL.create("postgresql+psycopg", username=os.getenv("PGUSER"), password=os.getenv("PGPASSWORD"),
                         host=os.getenv("PGHOST", "localhost"), port=int(os.getenv("PGPORT", "5432")),
                         database=os.getenv("PGDATABASE", "betaclimb"))
    if ca_file := os.getenv("PGSSLROOTCERT"):
        url = url.update_query_dict({"sslrootcert": ca_file})
    return url


class DBManager:
    def __init__(self, lease_seconds: int = 90, max_tries: int = 3):
        schema = os.getenv("DB_SCHEMA", "public")
        if not re.fullmatch("[a-z_][a-z0-9_]*", schema):
            raise ValueError("Invalid DB_SCHEMA")
        self.lease_seconds = lease_seconds
        self.max_tries = max_tries
        self.engine = create_async_engine(connection_url(), pool_pre_ping=True, connect_args={
            "options": f"-csearch_path={schema} -ctimezone=UTC",
        })
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)

    async def claim(self) -> Task | None:
        dependency = (
            func.jsonb_array_elements_text(TaskModel.payload["dependsOn"])
            .table_valued(column("name", Text))
            .render_derived(name="dependency")
        )
        parent = aliased(TaskModel)
        parent_succeeded = (
            select(parent.id)
            .where(parent.video_id == TaskModel.video_id, parent.type == dependency.c.name,
                   parent.status == "succeeded")
            .correlate(TaskModel, dependency)
            .exists()
        )
        missing_parent = select(dependency.c.name).where(~parent_succeeded).correlate(TaskModel).exists()
        ready_task = (
            select(TaskModel.id, TaskModel.video_id, TaskModel.type, VideoModel.url, VideoModel.profile_snapshot)
            .join(VideoModel, VideoModel.id == TaskModel.video_id)
            .where(
                VideoModel.status == "processing",
                or_(and_(TaskModel.status == "pending", TaskModel.next_attempt_at <= func.now()),
                    and_(TaskModel.status == "running", TaskModel.lease_until <= func.now())),
                ~missing_parent,
            )
            .order_by(TaskModel.next_attempt_at, TaskModel.id)
            .limit(1)
            .with_for_update(of=TaskModel, skip_locked=True)
        )
        async with self.session.begin() as session:
            row = (await session.execute(ready_task)).one_or_none()
            if row is None:
                return None

            token = uuid4()
            tries = (await session.execute(
                update(TaskModel)
                .where(TaskModel.id == row.id)
                .values(status="running", lease_token=token, tries=TaskModel.tries + 1,
                        lease_until=func.now() + timedelta(seconds=self.lease_seconds), updated_at=func.now())
                .returning(TaskModel.tries)
            )).scalar_one()
            stage = display_stage(row.type)
            allowed_stages = ("holds", "movement") if stage == "rules" else ("holds",)
            await session.execute(
                update(VideoModel)
                .where(VideoModel.id == row.video_id, VideoModel.status == "processing",
                       VideoModel.stage.in_(allowed_stages))
                .values(stage=stage)
            )
            return Task(id=row.id, video_id=row.video_id, type=row.type, lease_token=token, tries=tries,
                        url=row.url, profile_snapshot=row.profile_snapshot)

    @staticmethod
    def _owned_task(task: Task) -> ColumnElement[bool]:
        return and_(TaskModel.id == task.id, TaskModel.lease_token == task.lease_token,
                    TaskModel.status == "running", TaskModel.lease_until > func.now())

    async def heartbeat(self, task: Task) -> bool:
        async with self.session.begin() as session:
            renewed = await session.scalar(
                update(TaskModel)
                .where(self._owned_task(task))
                .values(lease_until=func.now() + timedelta(seconds=self.lease_seconds), updated_at=func.now())
                .returning(TaskModel.id)
            )
            return renewed is not None

    async def artifacts(self, task: Task) -> dict[str, str]:
        async with self.session() as session:
            rows = await session.execute(
                select(TaskModel.type, TaskModel.result_key)
                .where(TaskModel.video_id == task.video_id, TaskModel.status == "succeeded")
            )
            return {stage: key for stage, key in rows}

    async def finish(self, task: Task, result_key: str, feedback: dict | None = None,
                     *, thumbnail_key: str | None = None) -> bool:
        async with self.session.begin() as session:
            completed = await session.scalar(
                update(TaskModel)
                .where(self._owned_task(task))
                .values(status="succeeded", result_key=result_key, lease_token=None, lease_until=None,
                        updated_at=func.now(), error=None)
                .returning(TaskModel.id)
            )
            if completed is None:
                return False

            if task.type == "prepare_video":
                if not thumbnail_key:
                    raise ValueError("Preparing a video requires a thumbnail")
                await session.execute(
                    update(VideoModel)
                    .where(VideoModel.id == task.video_id)
                    .values(result_data=VideoModel.result_data.concat({
                        "playbackKey": result_key, "thumbnailKey": thumbnail_key,
                    }))
                )
                new_tasks = [
                    {"id": uuid4(), "type": stage, "payload": {"dependsOn": list(dependencies)}}
                    for stage, dependencies in DEPENDENCIES.items() if dependencies
                ]
                await session.execute(
                    pg_insert(TaskModel)
                    .values(video_id=task.video_id, status="pending", next_attempt_at=func.now(),
                            created_at=func.now(), updated_at=func.now())
                    .on_conflict_do_nothing(constraint="tasks_video_stage_unique"),
                    new_tasks,
                )
            if feedback is not None:
                profile_id = await session.scalar(
                    update(VideoModel)
                    .where(VideoModel.id == task.video_id, VideoModel.status == "processing")
                    .values(status="limited" if feedback["limitations"] else "ready", stage="done",
                            duration_sec=feedback["durationSec"], result_data=VideoModel.result_data.concat(feedback))
                    .returning(VideoModel.profile_id)
                )
                if profile_id is not None and feedback["moments"]:
                    await session.execute(
                        insert(VideoAnalysisCommentModel)
                        .values(profile_id=profile_id, video_id=task.video_id, created_at=func.now()),
                        [{"id": uuid4(), "timecode": timedelta(seconds=moment["timeSec"]), "comment": moment["action"]}
                         for moment in feedback["moments"]],
                    )
            return True

    async def fail(self, task: Task, reason: str, *, rejected: bool = False, retryable: bool = True) -> None:
        retry = retryable and not rejected and task.tries < self.max_tries
        async with self.session.begin() as session:
            if not retry:
                # Lock sibling tasks in the same order before changing the video or cancelling its other branches.
                await session.execute(
                    select(TaskModel.id)
                    .where(TaskModel.video_id == task.video_id, TaskModel.status.in_(("pending", "running")))
                    .order_by(TaskModel.id)
                    .with_for_update()
                )
            delay = timedelta(seconds=min(60, 2 ** min(task.tries, 6)))
            failed = await session.scalar(
                update(TaskModel)
                .where(self._owned_task(task))
                .values(status="pending" if retry else "failed", error=reason, lease_until=None, lease_token=None,
                        next_attempt_at=func.now() + delay, updated_at=func.now())
                .returning(TaskModel.id)
            )
            if failed is not None and not retry:
                await session.execute(
                    update(VideoModel)
                    .where(VideoModel.id == task.video_id, VideoModel.status == "processing")
                    .values(status="rejected" if rejected else "failed", reject_reason=reason,
                            stage=display_stage(task.type))
                )
                await session.execute(
                    update(TaskModel)
                    .where(TaskModel.video_id == task.video_id, TaskModel.id != task.id,
                           TaskModel.status.in_(("pending", "running")))
                    .values(status="cancelled", lease_token=None, lease_until=None, updated_at=func.now())
                )
