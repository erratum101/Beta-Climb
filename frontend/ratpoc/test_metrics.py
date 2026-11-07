"""Checks that timing gaps and duplicate predictions cannot inflate quality."""

import unittest

from evaluate import assign, event_score, temporal_iou
from prototype import contact_events, LIMBS


def frames(holds):
    return [{"t": round(i / 10, 3), "limbs": {limb: {"hold_id": hold if limb == "lh" else None}
                                           for limb in LIMBS}} for i, hold in enumerate(holds)]


class ContactTests(unittest.TestCase):
    def test_unknown_is_not_a_contact(self):
        self.assertEqual(contact_events(frames([None] * 20), 2), [])

    def test_short_brush_is_not_a_contact(self):
        self.assertEqual(contact_events(frames([1] * 3 + [None] * 7), 1), [])

    def test_short_gap_preserves_observed_duration(self):
        events = contact_events(frames([1] * 4 + [None] * 2 + [1] * 5), 1.1)
        self.assertEqual(len(events), 1)
        self.assertAlmostEqual(events[0]["observed_s"], 0.9)
        self.assertAlmostEqual(events[0]["end_s"], 1.1)

    def test_long_gap_splits_events(self):
        events = contact_events(frames([1] * 6 + [None] * 5 + [1] * 6), 1.7)
        self.assertEqual(len(events), 2)


class MetricTests(unittest.TestCase):
    def test_one_to_one_assignment_prioritizes_valid_matches(self):
        self.assertEqual(set(assign([[0.9, 0.51], [0.51, 0.49]], 0.5)), {(0, 1), (1, 0)})

    def test_duplicate_contact_is_a_false_positive(self):
        reference = [{"limb": "lh", "hold_id": 1, "start_s": 0, "end_s": 2}]
        prediction = {"limb": "lh", "reference_hold_id": 1, "start_s": 0, "end_s": 2}
        score = event_score([prediction, prediction], reference)
        self.assertEqual((score["tp"], score["fp"], score["fn"]), (1, 1, 0))

    def test_wrong_limb_and_unmapped_hold_do_not_match(self):
        reference = [{"limb": "lh", "hold_id": 1, "start_s": 0, "end_s": 2}]
        predictions = [{"limb": limb, "reference_hold_id": hold, "start_s": 0, "end_s": 2}
                       for limb, hold in [("rh", 1), ("lh", None)]]
        score = event_score(predictions, reference)
        self.assertEqual((score["tp"], score["fp"], score["fn"]), (0, 2, 1))

    def test_touching_intervals_have_zero_overlap(self):
        self.assertEqual(temporal_iou({"start_s": 0, "end_s": 1}, {"start_s": 1, "end_s": 2}), 0)


if __name__ == "__main__":
    unittest.main()
