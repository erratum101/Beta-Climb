"""Score the worker's contact decoder on saved RatPoC poses against The Way Up labels.

No models or videos are needed: hold masks and MediaPipe landmarks come from
frontend/ratpoc/results/verification. Saved results carry no hold colours, so
--known-route marks the holds that match annotated route boxes with one colour.
That run is an optimistic bound for a correct route choice, not an automatic result.

Run from backend/worker: poetry run python evaluation/check_contacts.py [--known-route]
"""

import argparse
import json
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1]
RATPOC = WORKER.parents[1] / "frontend" / "ratpoc"
sys.path[:0] = [str(WORKER / "src"), str(RATPOC)]

from evaluate import evaluate, event_score  # noqa: E402
from service.video.analysis import match_contacts  # noqa: E402

SAMPLES = [("p2a_orange", "development"), ("p3_orange", "test-p3"), ("p4_green", "test-p4")]
LIMBS = {"leftHand": "lh", "rightHand": "rh", "leftFoot": "lf", "rightFoot": "rf"}
GROUPS = {"all": set(LIMBS.values()), "hands": {"lh", "rh"}, "feet": {"lf", "rf"}}
OTHER_COLOURS = ("yellow", "blue", "red", "purple")


def worker_inputs(result: dict, route_holds: set) -> tuple[dict, dict]:
    width, height = result["video"]["width"], result["video"]["height"]
    info = {"width": width, "height": height, "fps": result["video"]["fps"],
            "durationSec": result["video"]["duration_s"]}
    holds = []
    for hold in result["holds"]:
        x0, y0, x1, y1 = hold["bbox"]
        colour = "unknown"
        if route_holds:
            colour = "green" if hold["id"] in route_holds else OTHER_COLOURS[hold["id"] % 4]
        holds.append({"id": f"h{hold['id']}", "x": (x0 + x1) / 2 / width, "y": (y0 + y1) / 2 / height,
                      "color": colour, "polygon": [[x / width, y / height] for x, y in hold["polygon"]]})
    frames = [{"t": frame["t"], "camera": {"state": "aligned"},
               "keypoints": [[x / width, y / height, v, p] for x, y, v, p in frame["keypoints"]]}
              for frame in result["frames"]]
    return {"video": info, "holds": holds}, {"video": info, "sampleFps": 10, "frames": frames}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--known-route", action="store_true")
    args = parser.parse_args()
    for name, folder in SAMPLES:
        result = json.loads((RATPOC / "results/verification" / folder / "result.json").read_text())
        prefix = RATPOC / "assets/annotations" / name
        reference = evaluate(result, Path(f"{prefix}_routeAnnotation.json"), Path(f"{prefix}_holdUsage.csv"))
        mapping = reference["hold_id_mapping"]
        decoded = match_contacts(*worker_inputs(result, set(mapping) if args.known_route else set()))
        predicted = []
        for event in decoded["events"]:
            hold = int(event["observations"]["holdId"][1:])
            predicted.append({"limb": LIMBS[event["observations"]["limb"]], "start_s": event["startSec"],
                              "end_s": event["endSec"], "reference_hold_id": mapping.get(hold)})
        print(f"{name}: hold scope {decoded['holdScope']}")
        for group, limbs in GROUPS.items():
            score = event_score([p for p in predicted if p["limb"] in limbs],
                                [g for g in reference["reference_events"] if g["limb"] in limbs])
            print(f"  {group:5s} precision {score['precision']:.1%}  recall {score['recall']:.1%}  "
                  f"TP {score['tp']} / FP {score['fp']} / FN {score['fn']}")


if __name__ == "__main__":
    main()
