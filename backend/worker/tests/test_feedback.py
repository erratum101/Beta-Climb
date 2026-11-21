import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from service.feedback import build_feedback
from service.llm import LLMError
from service.technique import COACH_PROMPT, PRINCIPLES, SOURCES


TIMELINE = {
    "durationSec": 9,
    "holds": [{"id": "h1", "x": 0.5, "y": 0.3, "polygon": [[0.45, 0.3], [0.5, 0.3], [0.45, 0.4]]}],
    "route": {"status": "unknown"}, "limitations": ["Цвет трассы неизвестен."],
    "events": [
        {"id": "window-1", "type": "movementWindow", "startSec": 3.2, "endSec": 5.4,
         "usableForAdvice": True, "holdIds": ["h1"], "observations": {
             "sampleCount": 22, "contactIds": ["contact-1"],
             "hipCenterInImage": {"firstXY": [0.64, 0.4], "lastXY": [0.61, 0.45], "visibleSamples": 20},
             "jointAngles2dDeg": {"leftElbow": {"first": 140, "last": 120, "visibleSamples": 18},
                                  "rightElbow": {"first": 20, "last": 135, "visibleSamples": 2}}}},
        {"id": "hidden", "type": "movementWindow", "startSec": 6, "endSec": 9,
         "usableForAdvice": False, "holdIds": [], "observations": {"poseSamples": 0}},
        {"id": "contact-1", "type": "tentativeContact", "startSec": 3.6, "endSec": 4.6,
         "usableForAdvice": True, "holdIds": ["h1"], "observations": {"limb": "leftFoot", "holdId": "h1", "observedSec": 1}},
    ],
}


class Chat:
    def __init__(self, data):
        self.data = data
        self.calls = []

    async def complete(self, messages):
        self.calls.append(messages)
        return json.dumps(self.data, ensure_ascii=False)


def suggestion(**changes):
    return {
        "category": "sequence", "title": "Подготовка к движению влево",
        "problem": "Направление корпуса может помочь с подготовкой перехода.",
        "action": "Сравни положение корпуса перед переходом в следующей попытке.",
        "evidenceRefs": ["window-1/hipCenterInImage"], "principleIds": ["prepare_lateral_reach"], **changes,
    }


class CoachingResourcesTests(unittest.TestCase):
    def test_principles_have_sources_conditions_and_camera_limits(self):
        self.assertIn("evidenceRefs", COACH_PROMPT)
        self.assertIn("principleIds", COACH_PROMPT)
        used = set()
        for key, card in PRINCIPLES.items():
            with self.subTest(principle=key):
                self.assertRegex(key, r"^[a-z][a-z0-9_]*$")
                for field in ("phase", "principle", "when", "observation", "alternative", "cameraLimit"):
                    self.assertTrue(card[field].strip())
                self.assertTrue(card["sourceIds"])
                self.assertTrue(set(card["sourceIds"]).issubset(SOURCES))
                used.update(card["sourceIds"])
        self.assertEqual(used, set(SOURCES))
        for source in SOURCES.values():
            self.assertTrue(source["author"].strip() and source["title"].strip())
            self.assertTrue(source["url"].startswith("https://"))

    @unittest.skipUnless(shutil.which("poetry"), "wheel packaging check requires Poetry")
    def test_resources_load_from_wheel_without_source_tree(self):
        worker = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as tmp:
            env = {**os.environ, "POETRY_CACHE_DIR": str(Path(tmp) / "cache")}
            subprocess.run(["poetry", "build", "--format", "wheel", "--output", tmp], cwd=worker,
                           env=env, check=True, capture_output=True)
            wheel, = Path(tmp).glob("*.whl")
            script = (
                "import sys; sys.path.insert(0, sys.argv[1]); from service import technique; "
                "assert '.whl/' in technique.__file__; assert technique.COACH_PROMPT.strip(); "
                "assert technique.PRINCIPLES and technique.SOURCES"
            )
            subprocess.run([sys.executable, "-I", "-S", "-c", script, str(wheel)], cwd=tmp, check=True)


class FeedbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_model_selects_novel_episode_with_real_window_and_source(self):
        client = Chat({"moments": [suggestion()]})
        profile = {"experience": "gt1y", "nickname": "private", "weightKg": 75,
                   "heightCm": 177, "consentAccepted": True}
        result = await build_feedback(TIMELINE, profile, client)
        payload = json.loads(client.calls[0][1]["content"])
        self.assertEqual(payload["athlete"], {"experience": "gt1y", "heightCmRange": [175, 179]})
        self.assertEqual(len(payload["events"]), len(TIMELINE["events"]))
        self.assertEqual(set(payload["events"][0]["measurements"]),
                         {"window-1/hipCenterInImage", "window-1/jointAngles2dDeg.leftElbow"})
        self.assertEqual(payload["events"][0]["context"]["sampleCount"], 22)
        self.assertEqual(set(payload["events"][2]["measurements"]), {"contact-1/proximity2d"})
        self.assertEqual(payload["events"][1], TIMELINE["events"][1])
        self.assertNotIn("polygon", payload["holds"][0])
        self.assertEqual(set(payload["principles"]), set(PRINCIPLES))
        card = result["moments"][0]
        self.assertEqual((card["startSec"], card["timeSec"], card["endSec"]), (3.2, 3.2, 5.4))
        self.assertEqual(card["holdIds"], [])
        self.assertEqual(card["anchorObservation"]["value"]["lastXY"], [0.61, 0.45])
        self.assertIn("влево на 3% ширины кадра и вниз на 5% высоты кадра", card["happened"])
        self.assertEqual(payload["events"][0]["measurements"]["window-1/hipCenterInImage"]["visibleObservation"],
                         card["happened"])
        self.assertEqual(card["sources"][0]["id"], "balance")
        self.assertEqual(card["principleIds"], ["prepare_lateral_reach"])
        self.assertEqual(result["primaryAction"], card["action"])

    async def test_bad_references_trigger_one_repair_then_partial_feedback(self):
        for invalid in ({"evidenceRefs": ["unseen"]}, {"evidenceRefs": ["hidden/poseSamples"]},
                        {"principleIds": ["nonexistent"]}, {"evidenceRefs": ["window-1/sampleCount"]},
                        {"evidenceRefs": ["contact-1/limb"]}, {"evidenceRefs": ["contact-1/holdId"]},
                        {"evidenceRefs": ["window-1/jointAngles2dDeg.rightElbow"]}, {"timeSec": 100},
                        {"happened": "Стопа удерживается на зацепке."}, {"title": "Опора на h189"},
                        {"problem": "В window-4 заметно движение."}, {"action": "См. https://example.com/fabricated"}):
            with self.subTest(invalid=invalid):
                client = Chat({"moments": [suggestion(**invalid)]})
                result = await build_feedback(TIMELINE, {}, client)
                self.assertEqual(len(client.calls), 2)
                self.assertEqual(result["moments"], [])
                self.assertIn("Повторная проверка", result["limitations"][-1])

    async def test_contact_is_described_as_projected_proximity_and_highlight_covers_entire_card(self):
        contact = TIMELINE["events"][2]
        client = Chat({"moments": [suggestion(evidenceRefs=["contact-1/proximity2d"])]})
        card, = (await build_feedback(TIMELINE, {}, client))["moments"]
        self.assertEqual(card["holdIds"], ["h1"])
        self.assertEqual(card["happened"], "Левая стопа на изображении была рядом с контуром зацепки в сумме 1 с.")

        client = Chat({"moments": [suggestion(evidenceRefs=["window-1/jointAngles2dDeg.leftElbow", "contact-1/proximity2d"])]})
        for first, last, observed, highlights in [(3.6, 4.6, 1, []), (3, 6, 2.6, []), (3, 6, 3, ["h1"])]:
            with self.subTest(first=first, last=last, observed=observed):
                timeline = {**TIMELINE, "events": [*TIMELINE["events"][:2], {
                    **contact, "startSec": first, "endSec": last,
                    "observations": {**contact["observations"], "observedSec": observed},
                }]}
                card, = (await build_feedback(timeline, {}, client))["moments"]
                self.assertEqual(card["holdIds"], highlights)
                self.assertIn("левого локтя составил 140° в первом видимом кадре и 120° в последнем", card["happened"])

    async def test_valid_card_survives_rejected_sibling(self):
        client = Chat({"moments": [suggestion(principleIds=["invented"]), suggestion()]})
        result = await build_feedback(TIMELINE, {}, client)
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(len(result["moments"]), 1)
        self.assertTrue(result["moments"][0]["primary"])
        self.assertIn("Часть предложенных", result["limitations"][-1])

    async def test_corrected_reference_is_used_on_second_response(self):
        class Repair(Chat):
            async def complete(self, messages):
                self.data = {"moments": [suggestion(evidenceRefs=["wrong"]) if not self.calls else suggestion()]}
                return await super().complete(messages)

        client = Repair({})
        result = await build_feedback(TIMELINE, {}, client)
        self.assertEqual(len(client.calls), 2)
        self.assertEqual(len(result["moments"]), 1)
        self.assertEqual(result["limitations"], TIMELINE["limitations"])

    async def test_network_failure_is_propagated(self):
        class Offline:
            async def complete(self, messages):
                raise LLMError("Eliza request failed", retryable=True)

        with self.assertRaises(LLMError) as raised:
            await build_feedback(TIMELINE, {}, Offline())
        self.assertTrue(raised.exception.retryable)

    async def test_abstention_and_no_visible_evidence(self):
        client = Chat({"moments": []})
        result = await build_feedback(TIMELINE, {"heightCm": 177, "consentAccepted": False}, client)
        self.assertNotIn("heightCmRange", json.loads(client.calls[0][1]["content"])["athlete"])
        self.assertEqual(result["moments"], [])
        partial = {**TIMELINE, "events": [TIMELINE["events"][1]]}
        result = await build_feedback(partial, {}, client)
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(result["moments"], [])
        self.assertEqual(len(result["limitations"]), 2)
