"""Download fixed public models and three annotated videos (about 150 MB total)."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import requests
from remotezip import RemoteZip

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
DATASET_URL = "https://zenodo.org/api/records/15196867/files/dataset.zip/content"
MODELS = {
    "holds.pt": "https://huggingface.co/samolego/yolo-holds/resolve/d8783875ee4012c4c2813aa335abeb716cc53eb0/model.pt",
    "mobile_sam.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/mobile_sam.pt",
    "pose_landmarker_heavy.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
}
# Selected before model evaluation. p2a is development; p3 and p4 are held out.
VIDEOS = {"p2a_orange": "development", "p3_orange": "test", "p4_green": "test"}


def download(url, path):
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    with requests.get(url, stream=True, timeout=90) as response:
        response.raise_for_status()
        with temporary.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                output.write(chunk)
    temporary.replace(path)


def main():
    for name, url in MODELS.items():
        download(url, ASSETS / "models" / name)
        print(f"model: {name}", flush=True)
    entries = []
    with RemoteZip(DATASET_URL, timeout=90) as archive:
        for name, split in VIDEOS.items():
            participant, route = name.split("_")
            for suffix in [".mp4", "_routeAnnotation.json", "_holdUsage.csv"]:
                member = f"{participant}/{route}{suffix}"
                directory = "videos" if suffix == ".mp4" else "annotations"
                path = ASSETS / directory / f"{name}{suffix}"
                path.parent.mkdir(parents=True, exist_ok=True)
                if not path.exists():
                    data = archive.read(member)  # ZIP CRC is checked by zipfile.
                    path.write_bytes(data)
                entries.append({"path": str(path.relative_to(ROOT)), "member": member,
                                "split": split, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
                print(f"dataset: {member}", flush=True)
    clips = ASSETS / "clips"
    clips.mkdir(exist_ok=True)
    for name in VIDEOS:
        destination = clips / f"{name}.mp4"
        if not destination.exists():
            source = ASSETS / "videos" / f"{name}.mp4"
            if name == "p4_green":
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                                "-i", str(source), "-t", "60", "-an", "-c:v", "libx264", "-preset",
                                "fast", "-crf", "18", "-pix_fmt", "yuv420p", str(destination)], check=True)
            else:
                shutil.copyfile(source, destination)
        entries.append({"path": str(destination.relative_to(ROOT)), "split": VIDEOS[name],
                        "preparation": "first 60 seconds, H.264 CRF18" if name == "p4_green" else "unchanged copy",
                        "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()})
    manifest = {"dataset": DATASET_URL, "license": "CC-BY-4.0", "files": entries,
                "models": [{"path": f"assets/models/{name}", "url": url,
                            "sha256": hashlib.sha256((ASSETS / "models" / name).read_bytes()).hexdigest()}
                           for name, url in MODELS.items()]}
    (ROOT / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
