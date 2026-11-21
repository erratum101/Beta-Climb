"""Isolated entry point for native video decoding and inference."""

import json
import sys
from pathlib import Path

from service.video import VideoRejected, run_stage


def main() -> None:
    stage, source, destination, models, dependencies = sys.argv[1:]
    output = Path(destination)
    inputs = {name: Path(path) for name, path in json.loads(dependencies).items()}
    try:
        run_stage(stage, Path(source), inputs, output, Path(models))
    except VideoRejected as exc:
        output.with_suffix(".reason").write_text(str(exc))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
