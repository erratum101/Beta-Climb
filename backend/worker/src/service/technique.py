"""Read the coaching resources from the installed worker package."""

import json
from importlib.resources import files


_PACKAGE = files("service")
COACH_PROMPT = _PACKAGE.joinpath("prompts", "climbing_coach.ru.md").read_text(encoding="utf-8")
_CATALOG = json.loads(_PACKAGE.joinpath("knowledge", "climbing.ru.json").read_text(encoding="utf-8"))
PRINCIPLES = _CATALOG["principles"]
SOURCES = _CATALOG["sources"]
