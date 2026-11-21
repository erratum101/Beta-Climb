"""PostgreSQL tables shared with the API. Flyway manages their schema."""

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import Double, ForeignKey, Index, String, Text, UniqueConstraint, and_
from sqlalchemy.dialects.postgresql import ARRAY, INTERVAL, JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from database.enums import TaskStatus


class Base(DeclarativeBase):
    pass


class AthleteProfileModel(Base):
    __tablename__ = "athlete_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    nickname: Mapped[str] = mapped_column(String(24))
    height_cm: Mapped[int]
    weight_kg: Mapped[int]
    age_years: Mapped[int]
    experience: Mapped[str] = mapped_column(String(16))
    disciplines: Mapped[list[str]] = mapped_column(ARRAY(Text))
    max_grade: Mapped[str] = mapped_column(String(16))
    gender: Mapped[str] = mapped_column(String(6))
    consent_accepted: Mapped[bool]


class VideoModel(Base):
    __tablename__ = "videos"
    __table_args__ = (
        Index("idx_videos_profile_id", "profile_id"),
        UniqueConstraint("owner_key", "request_id", name="videos_owner_request_unique"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    profile_id: Mapped[UUID] = mapped_column(ForeignKey("athlete_profiles.id"))
    url: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP)
    request_id: Mapped[UUID | None]
    owner_key: Mapped[str | None] = mapped_column(Text)
    file_name: Mapped[str | None] = mapped_column(Text)
    stage: Mapped[str] = mapped_column(Text, server_default="holds")
    duration_sec: Mapped[float | None] = mapped_column(Double)
    discipline: Mapped[str | None] = mapped_column(Text)
    profile_snapshot: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    result_data: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    reject_reason: Mapped[str | None] = mapped_column(Text)


class TaskModel(Base):
    __tablename__ = "tasks"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    next_attempt_at: Mapped[datetime] = mapped_column(TIMESTAMP)
    tries: Mapped[int] = mapped_column(server_default="0")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP)
    status: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text)
    video_id: Mapped[UUID | None] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"))
    lease_token: Mapped[UUID | None]
    lease_until: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    result_key: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        UniqueConstraint("video_id", "type", name="tasks_video_stage_unique"),
        Index("idx_tasks_video_pending", next_attempt_at,
              postgresql_where=and_(video_id.is_not(None), status == TaskStatus.PENDING)),
        Index("idx_tasks_video_running", lease_until,
              postgresql_where=and_(video_id.is_not(None), status == TaskStatus.RUNNING)),
    )


class VideoAnalysisCommentModel(Base):
    __tablename__ = "video_analyzation_comments"
    __table_args__ = (
        Index("idx_video_analyzation_comments_video_timecode", "video_id", "timecode"),
        Index("idx_video_analyzation_comments_profile_id", "profile_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    profile_id: Mapped[UUID] = mapped_column(ForeignKey("athlete_profiles.id"))
    video_id: Mapped[UUID] = mapped_column(ForeignKey("videos.id"))
    timecode: Mapped[timedelta] = mapped_column(INTERVAL)
    comment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP)
