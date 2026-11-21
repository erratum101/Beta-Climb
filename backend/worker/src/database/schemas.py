from dataclasses import dataclass
from uuid import UUID

from database.enums import Stage


@dataclass(frozen=True)
class Task:
    """A leased row of the queue together with the input of its video."""

    id: UUID
    video_id: UUID
    type: Stage
    lease_token: UUID
    tries: int
    url: str
    profile_snapshot: dict
