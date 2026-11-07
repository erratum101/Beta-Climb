"""Protect denominators in frame-level diagnostic contact metrics."""

import unittest

from verify_poc import LIMBS, sample_score


class FrameScoreTests(unittest.TestCase):
    def score(self, hold, unsupported=False, expected=True):
        result = {"frames": [{"t": 1.0, "limbs": {
            limb: {"hold_id": hold if limb == "lh" else None} for limb in LIMBS}}]}
        event = {"limb": "lh", "hold_id": 7, "start_s": 0, "end_s": 2}
        evaluation = {"hold_id_mapping": {1: 7, 2: 8},
                      "reference_events": [event] if expected else [],
                      "unsupported_reference_events": [event] if unsupported else []}
        return sample_score(result, evaluation)["hands"]

    def test_correct_contact(self):
        score = self.score(1)
        self.assertEqual((score["tp"], score["fp"], score["fn"]), (1, 0, 0))

    def test_wrong_hold_is_false_positive_and_missed_reference(self):
        score = self.score(2)
        self.assertEqual((score["tp"], score["fp"], score["fn"]), (0, 1, 1))

    def test_unknown_does_not_remove_reference(self):
        self.assertEqual(self.score(None)["fn"], 1)

    def test_unmapped_prediction_is_false_positive(self):
        self.assertEqual(self.score(99, expected=False)["fp"], 1)

    def test_wall_interval_is_explicitly_excluded(self):
        score = self.score(1, unsupported=True)
        self.assertEqual((score["tp"], score["fp"], score["fn"], score["excluded"]), (0, 0, 0, 1))


if __name__ == "__main__":
    unittest.main()
