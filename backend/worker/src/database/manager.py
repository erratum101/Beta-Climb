"""Durable queue for one video per run. All leases use the PostgreSQL clock."""

from collections.abc import Sequence
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import ColumnElement, and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import aliased

from database.connection import create_engine
from database.enums import Stage, TaskStatus, VideoStage, VideoStatus
from database.models import TaskModel, VideoAnalysisCommentModel, VideoModel
from database.schemas import Task
from database.settings import DBSettings, QueueSettings

ACTIVE_STATUSES = (TaskStatus.PENDING, TaskStatus.RUNNING)


class DBManager:
    def __init__(self, settings: DBSettings | None = None, queue: QueueSettings | None = None):
        self._settings = queue or QueueSettings()
        self.engine = create_engine(settings or DBSettings())
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)

    async def claim(self, stage: Stage, inputs: Sequence[Stage] = ()) -> Task | None:
        ready = [
            TaskModel.type == stage,
            VideoModel.status == VideoStatus.PROCESSING,
            or_(
                and_(TaskModel.status == TaskStatus.PENDING, TaskModel.next_attempt_at <= func.now()),
                and_(TaskModel.status == TaskStatus.RUNNING, TaskModel.lease_until <= func.now()),
            ),
        ]

        if inputs:
            parent = aliased(TaskModel)
            succeeded_inputs = (
                select(func.count())
                .where(
                    parent.video_id == TaskModel.video_id,
                    parent.type.in_(inputs),
                    parent.status == TaskStatus.SUCCEEDED,
                )
                .correlate(TaskModel)
                .scalar_subquery()
            )
            ready.append(succeeded_inputs == len(set(inputs)))

        ready_task = (
            select(
                TaskModel.id,
                TaskModel.video_id,
                VideoModel.url,
                VideoModel.profile_snapshot,
            )
            .join(VideoModel, VideoModel.id == TaskModel.video_id)
            .where(*ready)
            .order_by(TaskModel.next_attempt_at, TaskModel.id)
            .limit(1)
            .with_for_update(of=TaskModel, skip_locked=True)
        )

        async with self.session.begin() as session:
            row = (await session.execute(ready_task)).one_or_none()
            if row is None:
                return None

            token = uuid4()
            tries = (
                await session.execute(
                    update(TaskModel)
                    .where(TaskModel.id == row.id)
                    .values(
                        status=TaskStatus.RUNNING,
                        lease_token=token,
                        tries=TaskModel.tries + 1,
                        lease_until=func.now() + timedelta(seconds=self._settings.lease_seconds),
                        updated_at=func.now(),
                    )
                    .returning(TaskModel.tries)
                )
            ).scalar_one()

            # Parallel branches claim in any order: the progress shown to the user only moves forward.
            progress = list(VideoStage)
            earlier_stages = progress[:progress.index(stage.video_stage)]

            await session.execute(
                update(VideoModel)
                .where(
                    VideoModel.id == row.video_id,
                    VideoModel.status == VideoStatus.PROCESSING,
                    VideoModel.stage.in_(earlier_stages),
                )
                .values(stage=stage.video_stage)
            )

            return Task(
                id=row.id,
                video_id=row.video_id,
                type=stage,
                lease_token=token,
                tries=tries,
                url=row.url,
                profile_snapshot=row.profile_snapshot,
            )

    @staticmethod
    def _owned_task(task: Task) -> ColumnElement[bool]:
        return and_(
            TaskModel.id == task.id,
            TaskModel.lease_token == task.lease_token,
            TaskModel.status == TaskStatus.RUNNING,
            TaskModel.lease_until > func.now(),
        )

    async def heartbeat(self, task: Task) -> bool:
        async with self.session.begin() as session:
            renewed = await session.scalar(
                update(TaskModel)
                .where(self._owned_task(task))
                .values(
                    lease_until=func.now() + timedelta(seconds=self._settings.lease_seconds),
                    updated_at=func.now(),
                )
                .returning(TaskModel.id)
            )
            return renewed is not None

    async def artifacts(self, task: Task) -> dict[str, str]:
        async with self.session() as session:
            rows = await session.execute(
                select(TaskModel.type, TaskModel.result_key)
                .where(
                    TaskModel.video_id == task.video_id,
                    TaskModel.status == TaskStatus.SUCCEEDED,
                )
            )
            return {stage: key for stage, key in rows}

    async def release(self, task: Task) -> None:
        async with self.session.begin() as session:
            await session.execute(
                update(TaskModel)
                .where(self._owned_task(task))
                .values(
                    status=TaskStatus.PENDING,
                    tries=TaskModel.tries - 1,
                    lease_token=None,
                    lease_until=None,
                    next_attempt_at=func.now(),
                    updated_at=func.now(),
                )
            )

    async def _complete(self, session: AsyncSession, task: Task, result_key: str) -> bool:
        completed = await session.scalar(
            update(TaskModel)
            .where(self._owned_task(task))
            .values(
                status=TaskStatus.SUCCEEDED,
                result_key=result_key,
                lease_token=None,
                lease_until=None,
                updated_at=func.now(),
                error=None,
            )
            .returning(TaskModel.id)
        )
        return completed is not None

    async def finish(self, task: Task, result_key: str) -> bool:
        """Every finish returns False when the lease was lost and nothing was recorded."""
        async with self.session.begin() as session:
            return await self._complete(session, task, result_key)

    async def finish_prepare_video(
        self,
        task: Task,
        result_key: str,
        *,
        thumbnail_key: str,
        next_stages: Sequence[Stage],
    ) -> bool:
        async with self.session.begin() as session:
            if not await self._complete(session, task, result_key):
                return False

            await session.execute(
                update(VideoModel)
                .where(VideoModel.id == task.video_id)
                .values(
                    result_data=VideoModel.result_data.concat({
                        "playbackKey": result_key,
                        "thumbnailKey": thumbnail_key,
                    }),
                )
            )
            session.add_all(
                TaskModel(
                    id=uuid4(),
                    video_id=task.video_id,
                    type=stage,
                    status=TaskStatus.PENDING,
                    payload={},
                    next_attempt_at=func.now(),
                    created_at=func.now(),
                    updated_at=func.now(),
                )
                for stage in next_stages
            )
            return True

    async def finish_build_feedback(self, task: Task, result_key: str, feedback: dict) -> bool:
        async with self.session.begin() as session:
            if not await self._complete(session, task, result_key):
                return False

            profile_id = await session.scalar(
                update(VideoModel)
                .where(VideoModel.id == task.video_id, VideoModel.status == VideoStatus.PROCESSING)
                .values(
                    status=VideoStatus.LIMITED if feedback["limitations"] else VideoStatus.READY,
                    stage=VideoStage.DONE,
                    duration_sec=feedback["durationSec"],
                    result_data=VideoModel.result_data.concat(feedback),
                )
                .returning(VideoModel.profile_id)
            )
            if profile_id is not None:
                session.add_all(
                    VideoAnalysisCommentModel(
                        id=uuid4(),
                        profile_id=profile_id,
                        video_id=task.video_id,
                        timecode=timedelta(seconds=moment["timeSec"]),
                        comment=moment["action"],
                        created_at=func.now(),
                    )
                    for moment in feedback["moments"]
                )
            return True

    async def fail(self, task: Task, reason: str, *, rejected: bool = False, retryable: bool = True) -> None:
        retry = retryable and not rejected and task.tries < self._settings.max_tries

        async with self.session.begin() as session:
            if not retry:
                # Lock sibling tasks in the same order before changing the video or cancelling its other branches.
                await session.execute(
                    select(TaskModel.id)
                    .where(TaskModel.video_id == task.video_id, TaskModel.status.in_(ACTIVE_STATUSES))
                    .order_by(TaskModel.id)
                    .with_for_update()
                )

            delay = timedelta(
                seconds=min(self._settings.retry_delay_max, self._settings.retry_delay_base ** min(task.tries, 32)),
            )
            failed = await session.scalar(
                update(TaskModel)
                .where(self._owned_task(task))
                .values(
                    status=TaskStatus.PENDING if retry else TaskStatus.FAILED,
                    error=reason,
                    lease_until=None,
                    lease_token=None,
                    next_attempt_at=func.now() + delay,
                    updated_at=func.now(),
                )
                .returning(TaskModel.id)
            )

            if failed is not None and not retry:
                await session.execute(
                    update(VideoModel)
                    .where(VideoModel.id == task.video_id, VideoModel.status == VideoStatus.PROCESSING)
                    .values(
                        status=VideoStatus.REJECTED if rejected else VideoStatus.FAILED,
                        reject_reason=reason,
                        stage=task.type.video_stage,
                    )
                )
                await session.execute(
                    update(TaskModel)
                    .where(
                        TaskModel.video_id == task.video_id,
                        TaskModel.id != task.id,
                        TaskModel.status.in_(ACTIVE_STATUSES),
                    )
                    .values(
                        status=TaskStatus.CANCELLED,
                        lease_token=None,
                        lease_until=None,
                        updated_at=func.now(),
                    )
                )
