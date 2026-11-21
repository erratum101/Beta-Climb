"""Prepare a local human review of one completed Beta Climb attempt."""

import argparse
import hashlib
import json
import math
from pathlib import Path


def seconds(value):
    if type(value) not in (float, int) or not math.isfinite(value) or value < 0:
        raise ValueError("Время должно быть конечным неотрицательным числом в секундах")
    return value


def build_form(rows, attempt, take_uid, start, duration, view=None):
    start, duration = seconds(start), seconds(duration)
    if not 0 < duration <= 60:
        raise ValueError("Длительность фрагмента должна быть больше нуля и не больше 60 секунд")
    if not isinstance(rows, list):
        raise ValueError("Ожидается JSON-массив demonstration annotations")
    selected = [row for row in rows if row.get("take_uid") == take_uid and row.get("scenario_name") == "Rock Climbing"]
    if len(selected) != 1:
        raise ValueError("Ожидается ровно одна демонстрация Rock Climbing для указанного take_uid")
    take = selected[0]
    if attempt.get("status") not in {"ready", "limited"} or not isinstance(attempt.get("moments"), list):
        raise ValueError("Нужен JSON завершённой попытки из GET /api/attempts/{id}")
    if abs(seconds(attempt["durationSec"]) - duration) > 1 / 30 + 1e-6:
        raise ValueError("Длительность попытки отличается от фрагмента более чем на один кадр 30 fps")

    annotations = []
    for field, prefix in (("good_executions", "good"), ("tips_for_improvement", "tip")):
        if not isinstance(take.get(field), list):
            raise ValueError(f"В demonstration annotations отсутствует массив {field}")
        for index, item in enumerate(take[field], start=1):
            pause = seconds(item["video_time"])
            if not isinstance(item["list"], list) or not all(isinstance(line, str) for line in item["list"]):
                raise ValueError(f"{field}[{index - 1}].list должен быть массивом строк")
            annotations.append({
                "id": f"{prefix}-{index}", "kind": field, "expertUid": item["expert_uid"],
                "videoName": item["video_name"], "comments": item["list"],
                "pauseInTakeSec": pause, "pauseRelativeToClipSec": round(pause - start, 6),
                "pauseInsideClip": start <= pause < start + duration,
                "review": {"visibility": None, "observedClipIntervalSec": None, "notes": ""},
            })

    advice = []
    for moment in attempt["moments"]:
        first, last = seconds(moment["startSec"]), seconds(moment["endSec"])
        if not first < last <= attempt["durationSec"]:
            raise ValueError("Интервал совета выходит за границы попытки")
        advice.append({
            "id": moment["id"], "title": moment["title"], "clipIntervalSec": [first, last],
            "takeIntervalSec": [round(start + first, 6), round(start + last, 6)],
            "happened": moment["happened"], "problem": moment["problem"], "action": moment["action"],
            "review": {"decision": None, "referenceIds": [], "notes": ""},
        })
    return {
        "formatVersion": 1, "takeUid": take_uid, "view": view, "cropStartInTakeSec": start,
        "cropDurationSec": duration, "attemptId": attempt["id"], "attemptStatus": attempt["status"],
        "limitations": attempt.get("limitations", []), "expertAnnotations": annotations, "modelAdvice": advice,
        "reviewer": "", "unmatchedVisibleTipIds": [], "reviewComplete": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--attempt", type=Path, required=True)
    parser.add_argument("--take", required=True)
    parser.add_argument("--start", required=True, type=float, help="Crop start on the take timeline in seconds")
    parser.add_argument("--duration", required=True, type=float, help="Crop duration in seconds")
    parser.add_argument("--view", help="View used for the upload, e.g. exo1")
    args = parser.parse_args()
    try:
        annotations = args.annotations.read_bytes()
        attempt = args.attempt.read_bytes()
        form = build_form(json.loads(annotations), json.loads(attempt), args.take, args.start, args.duration, args.view)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        parser.error(str(exc))
    form["sha256"] = {"annotations": hashlib.sha256(annotations).hexdigest(),
                      "attempt": hashlib.sha256(attempt).hexdigest()}
    print(json.dumps(form, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
