"""Occlusion must remove both sides; relaxing time must never relax identity."""

import tempfile
from pathlib import Path
import unittest

from analyze_tolerance import event_scores, interval_iou, read_occlusions, subtract, unique_pair_scores


class ToleranceTests(unittest.TestCase):
    def events(self, predicted, reference, mask=(), **kwargs):
        p = [{"limb": "lh", "reference_hold_id": hold, "start_s": a, "end_s": b}
             for hold, a, b in predicted]
        g = [{"limb": "lh", "hold_id": hold, "start_s": a, "end_s": b}
             for hold, a, b in reference]
        occ = {limb: list(mask) if limb == "lh" else [] for limb in ["lh", "rh", "lf", "rf"]}
        return event_scores(p, g, occ, 10, 25, **kwargs)["scores"]["all"]

    def test_masked_union_does_not_bridge_hidden_gap(self):
        visible = subtract([[0, 4]], [[1, 3]])
        self.assertEqual(visible, [[0, 1], [3, 4]])
        self.assertEqual(interval_iou(visible, [[1, 3]]), 0)

    def test_occluded_units_excluded_on_both_sides(self):
        s = self.events([(1, 0, 1)], [(1, 0, 1)], mask=[(0, 1)], visible=True)
        self.assertEqual((s["fp"], s["fn"], s["excluded_predictions"], s["excluded_reference"]), (0, 0, 1, 1))

    def test_wrong_hold_stays_wrong_with_delay(self):
        s = self.events([(2, 0.5, 1.5)], [(1, 0, 1)], delay=1)
        self.assertEqual((s["tp"], s["fp"], s["fn"]), (0, 1, 1))

    def test_late_contact_can_match_with_allowance(self):
        strict = self.events([(1, 0.5, 1.5)], [(1, 0, 1)])
        relaxed = self.events([(1, 0.5, 1.5)], [(1, 0, 1)], delay=0.5)
        self.assertEqual((strict["tp"], relaxed["tp"]), (0, 1))

    def test_early_prediction_not_helped_by_delay_allowance(self):
        s = self.events([(1, 0, 1)], [(1, 0.5, 1.5)], delay=0.5)
        self.assertEqual(s["tp"], 0)

    def test_duplicate_events_still_false_positive(self):
        s = self.events([(1, 0, 1), (1, 0, 1)], [(1, 0, 1)], visible=True)
        self.assertEqual((s["tp"], s["fp"], s["fn"]), (1, 1, 0))

    def test_visible_miss_stays_false_negative(self):
        s = self.events([], [(1, 0, 2)], mask=[(0, 1)], visible=True)
        self.assertEqual(s["fn"], 1)

    def test_occlusion_csv_is_inclusive_and_clipped(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "labels.csv"
            path.write_text('p,start,end,occluded\nlh 1,10,30,"0-12, 20, 25-99"\n')
            self.assertEqual(read_occlusions(path, 10, 3)["lh"], [[1, 1.3], [2, 2.1], [2.5, 3]])

    def test_unique_pairs_keep_different_unmapped_holds(self):
        p = [{"limb": "lh", "hold_id": i, "reference_hold_id": None, "start_s": 0, "end_s": 1}
             for i in [1, 2, 2]]
        s = unique_pair_scores(p, [], {"lh": []})["all"]
        self.assertEqual(s["fp"], 2)


if __name__ == "__main__":
    unittest.main()
