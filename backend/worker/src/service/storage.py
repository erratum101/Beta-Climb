import os
from pathlib import Path


class ObjectStorage:
    """Files shared with the API. The directory is a Railway volume in production."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or Path(os.environ.get("STORAGE_DIR", "data/media"))).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def download(self, key: str, destination: Path) -> None:
        destination.write_bytes(self._path(key).read_bytes())

    def upload(self, source: Path, key: str) -> None:
        content_type = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".json": "application/json"}[source.suffix]
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        target.with_name(target.name + ".type").write_text(content_type, encoding="utf-8")

    def delete(self, key: str) -> None:
        path = self._path(key)
        path.unlink(missing_ok=True)
        path.with_name(path.name + ".type").unlink(missing_ok=True)

    def _path(self, key: str) -> Path:
        parts = Path(key).parts
        if not key or key.startswith(("/", "\\")) or ".." in parts:
            raise ValueError("invalid storage key")
        path = (self.root / key).resolve()
        if path != self.root and self.root not in path.parents:
            raise ValueError("invalid storage key")
        return path
