import unittest

from compare_egoexo import build_form


def note(at, *lines):
    return {"video_time": at, "list": list(lines), "expert_uid": "synthetic-expert", "video_name": "synthetic-video"}


class ReviewFormTests(unittest.TestCase):
    def setUp(self):
        self.take = {"scenario_name": "Rock Climbing", "take_uid": "take",
                     "good_executions": [note(8, "Stable torso.")],
                     "tips_for_improvement": [note(12.5, "Turn your hips.", "Watch the next move."),
                                              note(20, "Place the foot once.")]}
        self.attempt = {"id": "synthetic-attempt", "status": "ready", "durationSec": 10, "moments": [
            {"id": "m1", "title": "Feet", "happened": "A foot moved twice.", "problem": "A second placement.",
             "action": "Aim for one foot placement.", "startSec": 2, "endSec": 3},
        ]}

    def test_converts_time_preserves_reference_context_and_keeps_meaning_undecided(self):
        other = {**self.take, "scenario_name": "Basketball"}
        form = build_form([other, self.take], self.attempt, "take", 10, 10, "exo1")
        good, tip, late = form["expertAnnotations"]
        self.assertEqual((good["kind"], good["pauseRelativeToClipSec"], good["pauseInsideClip"]),
                         ("good_executions", -2, False))
        self.assertEqual((tip["pauseRelativeToClipSec"], tip["pauseInsideClip"]), (2.5, True))
        self.assertEqual(tip["comments"], ["Turn your hips.", "Watch the next move."])
        self.assertFalse(late["pauseInsideClip"])
        self.assertIsNone(tip["review"]["observedClipIntervalSec"])
        model = form["modelAdvice"][0]
        self.assertEqual(model["takeIntervalSec"], [12, 13])
        # The coach's hip cue lands inside the model's footwork interval. Time alone supplies no match.
        self.assertEqual(model["review"], {"decision": None, "referenceIds": [], "notes": ""})
        self.assertFalse(form["reviewComplete"])

    def test_detects_wrong_schema_crop_and_duration(self):
        malformed = {**self.take, "tips_for_improvement": [{**note(10), "list": "not an array"}]}
        for rows, duration in (({"takes": [self.take]}, 10), ([{"scenario_name": "Rock Climbing", "take_uid": "take"}], 10),
                               ([malformed], 10), ([self.take], 61), ([self.take], 5)):
            with self.subTest(rows=rows, duration=duration), self.assertRaises(ValueError):
                build_form(rows, self.attempt, "take", 10, duration)

    def test_empty_attempt_still_exposes_expert_suggestions_for_review(self):
        form = build_form([self.take], {**self.attempt, "status": "limited", "moments": []}, "take", 10, 10)
        self.assertEqual(form["modelAdvice"], [])
        self.assertEqual(len(form["expertAnnotations"]), 3)
