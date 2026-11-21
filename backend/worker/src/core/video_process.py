"""Isolated entry point for native video decoding and inference. Runs the body of one stage task."""

import json
import sys
from importlib import import_module
from pathlib import Path

from service.video import VideoRejected


def main() -> None:
    module, name, source, destination, models, inputs = sys.argv[1:]
    task = getattr(import_module(module), name)
    output = Path(destination)
    try:
        task.run(Path(source), {stage: Path(path) for stage, path in json.loads(inputs).items()}, output,
                 Path(models))
    except VideoRejected as exc:
        output.with_suffix(".reason").write_text(str(exc))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
