"""Local stage boundary: artifact files of one stage. The worker's tasks own scheduling, storage and inputs."""

import json
import os
from contextlib import contextmanager
from collections.abc import Iterator
from pathlib import Path
from tempfile import NamedTemporaryFile

from .media import VideoRejected, prepare_video

__all__ = ["VideoRejected", "save_analysis", "save_prepared_video"]


@contextmanager
def _replacing(output: Path) -> Iterator[Path]:
    """Yield a temporary sibling that replaces output only when the block succeeds."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, suffix=output.suffix, delete=False) as file:
        temp = Path(file.name)
    try:
        yield temp
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)


def save_prepared_video(source: Path, output: Path) -> None:
    """Write a normalized MP4 and its JPEG cover next to it."""
    with _replacing(output) as temp:
        thumbnail = temp.with_suffix(".jpg")
        try:
            prepare_video(source, temp, thumbnail)
            os.replace(thumbnail, output.with_suffix(".jpg"))
        finally:
            thumbnail.unlink(missing_ok=True)


def save_analysis(output: Path, payload: dict) -> None:
    """Write a JSON analysis artifact."""
    with _replacing(output) as temp:
        temp.write_text(json.dumps({"schemaVersion": 1, **payload}, separators=(",", ":"),
                                   allow_nan=False, ensure_ascii=False), encoding="utf-8")
