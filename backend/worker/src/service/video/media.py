"""Decode user media once onto the timeline shared by every analysis stage."""

import json
import math
import subprocess
from contextlib import contextmanager
from pathlib import Path


class VideoRejected(ValueError):
    """The uploaded media cannot be processed as one short attempt."""


def prepare_video(source: Path, output: Path, thumbnail: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    # Accept self-contained containers. FFmpeg also supports playlists with external inputs.
    formats = ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi"]
    probe = subprocess.run([
        "ffprobe", "-v", "error", *formats, "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration:format=duration",
        "-of", "json", str(source),
    ], capture_output=True, timeout=30)
    if probe.returncode:
        raise VideoRejected("Не удалось прочитать видео. Загрузите файл MP4, MOV или WebM.")
    info = json.loads(probe.stdout)
    streams = info.get("streams", [])
    if not streams or min(streams[0]["width"], streams[0]["height"]) < 2:
        raise VideoRejected("В файле отсутствует видеодорожка.")
    for duration in (streams[0].get("duration"), info.get("format", {}).get("duration")):
        if duration and duration != "N/A" and float(duration) > 60.0:
            raise VideoRejected("Загрузите одну попытку длительностью до 60 секунд.")
    # Decode a sentinel frame past the limit to catch streams with missing/incorrect metadata.
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-xerror", "-y",
        *formats, "-i", str(source), "-map", "0:v:0", "-an", "-sn", "-dn",
        "-vf", "setpts=PTS-STARTPTS,fps=30,scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-frames:v", "1801", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-f", "mp4", str(output),
    ]
    encoded = subprocess.run(command, capture_output=True, timeout=240)
    if encoded.returncode:
        error = encoded.stderr.decode(errors="replace")
        if any(message in error for message in ("No space left", "Permission denied", "Unknown encoder")):
            raise RuntimeError("Worker could not encode the local video")
        raise VideoRejected("Не удалось декодировать видеодорожку до конца.")
    import cv2
    with capture(output, reject=True) as cap:
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if frames > 1800:
            raise VideoRejected("Загрузите одну попытку длительностью до 60 секунд.")
        if frames < 1:
            raise VideoRejected("В записи нет доступных кадров.")
        ok, first_frame = cap.read()
        if not ok:
            raise VideoRejected("Не удалось прочитать первый кадр.")
        write_thumbnail(first_frame, thumbnail)


def write_thumbnail(frame, target: Path) -> None:
    import cv2
    height, width = frame.shape[:2]
    scale = 480 / max(height, width)
    if scale < 1:
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        frame = cv2.resize(frame, size, interpolation=cv2.INTER_AREA)
    if not cv2.imwrite(str(target), frame, [cv2.IMWRITE_JPEG_QUALITY, 85]):
        raise OSError("Could not write video thumbnail")


@contextmanager
def capture(source: Path, *, reject: bool = False):
    import cv2
    cap = cv2.VideoCapture(str(source))
    try:
        if not cap.isOpened():
            if reject:
                raise VideoRejected("Не удалось открыть видеодорожку.")
            raise RuntimeError("Normalized video is unavailable")
        yield cap
    finally:
        cap.release()


def video_info(cap) -> dict:
    import cv2
    fps = cap.get(cv2.CAP_PROP_FPS)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if not math.isfinite(fps) or fps <= 0 or count < 1:
        raise RuntimeError("Invalid normalized video metadata")
    return {"width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": fps, "frameCount": count, "durationSec": round(count / fps, 5)}


def read_frame(cap, index: int):
    import cv2
    cap.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError(f"Could not decode normalized frame {index}")
    return frame


def weight(models_dir: Path, name: str) -> Path:
    path = models_dir / name
    if not path.is_file():
        raise FileNotFoundError(f"Missing worker model {name}")
    return path
