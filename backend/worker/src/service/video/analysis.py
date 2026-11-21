"""Turn wall geometry and sampled poses into time-addressable, descriptive evidence."""

from collections import Counter
from math import ceil, hypot

import cv2
import numpy as np
from scipy.stats import poisson_binom

from .vision import HOLD_COLORS

LIMBS = {"leftHand": (15, 19), "rightHand": (16, 20), "leftFoot": (31,), "rightFoot": (32,)}
JOINTS = {"leftElbow": (11, 13, 15), "rightElbow": (12, 14, 16),
          "leftKnee": (23, 25, 27), "rightKnee": (24, 26, 28)}


# Contact decoding. Values were chosen on saved The Way Up poses; see VERIFICATION.md.
REACH = 0.28          # hold search radius, in torso lengths
MAX_SPEED = 1.0       # a limb moving faster than this many torso lengths per second is in transit
MAX_GAP = 1.0         # seconds a contact may go unobserved before it is split
MIN_CONTACT = 0.8     # seconds of observed proximity needed for an event


def visible(point):
    return min(point[2:]) >= 0.5 and all(0 <= value <= 1 for value in point[:2])


def in_frame(point):
    return all(0 <= value <= 1 for value in point[:2])


def limb_observation(frames, index, indices, contours, dimensions, previous):
    """Nearest hold to a resting limb. Landmark visibility is reported, not used as a gate:
    with the climber's back to the camera it rejects mostly correct hand positions."""
    points = frames[index]["keypoints"]
    observed = [np.array(points[i][:2]) * dimensions for i in indices if in_frame(points[i])]
    if not observed or not all(in_frame(points[i]) for i in (11, 12, 23, 24)):
        return {"state": "unknown"}
    coords = np.asarray(points)[:, :2] * dimensions
    torso = float(np.linalg.norm(np.mean(coords[[11, 12]], axis=0) - np.mean(coords[[23, 24]], axis=0)))
    if torso <= 0:
        return {"state": "unknown"}
    low = not any(visible(points[i]) for i in indices)
    before, after = frames[max(0, index - 2)], frames[min(len(frames) - 1, index + 2)]
    if before["keypoints"] and after["keypoints"] and after["t"] > before["t"]:
        step = (np.array(after["keypoints"][indices[0]][:2]) - before["keypoints"][indices[0]][:2]) * dimensions
        if np.linalg.norm(step) / (after["t"] - before["t"]) / torso > MAX_SPEED:
            return {"state": "moving", "lowVisibility": low}
    radius = float(np.clip(torso * REACH, 4, 40))
    distances = []
    for hold_id, contour in contours.items():
        dist = min(max(0, -cv2.pointPolygonTest(contour, tuple(float(v) for v in p), True)) for p in observed)
        if dist <= radius:
            distances.append((dist, hold_id))
    if not distances:
        return {"state": "noCandidate", "lowVisibility": low}
    distances.sort()
    chosen = distances[0]
    # A resting limb stays on its hold. Jitter towards a neighbour should not split the contact.
    kept = next((d for d in distances if d[1] == previous), None)
    if kept:
        chosen = kept
    elif len(distances) > 1 and distances[1][0] - distances[0][0] < 0.2 * radius:
        return {"state": "ambiguous", "lowVisibility": low}
    return {"state": "candidate", "holdId": chosen[1], "distancePx": round(chosen[0], 2), "lowVisibility": low}


def contact_intervals(frames, duration):
    events = []
    for limb in LIMBS:
        active = None
        for i, frame in enumerate(frames):
            t = frame["t"]
            end = frames[i + 1]["t"] if i + 1 < len(frames) else duration
            obs = frame["limbs"][limb]
            hold = obs.get("holdId")
            interrupted = obs["state"] == "mapUnavailable"
            if active and (interrupted or t - active["endSec"] > MAX_GAP + 1e-5
                           or hold is not None and hold != active["holdId"]):
                events.append(active)
                active = None
            if hold is None:
                continue
            if active is None:
                active = {"startSec": t, "holdId": hold, "limb": limb, "observedSec": 0, "lowVisibilitySec": 0}
            active["endSec"] = end
            active["observedSec"] += end - t
            active["lowVisibilitySec"] += (end - t) * bool(obs.get("lowVisibility"))
        if active:
            events.append(active)
    events = sorted((e for e in events if e["observedSec"] >= MIN_CONTACT - 1e-5),
                    key=lambda e: (e["startSec"], e["limb"]))
    return [{"id": f"contact-{i}", "type": "tentativeContact",
             "usableForAdvice": e["observedSec"] >= 0.75 * (e["endSec"] - e["startSec"]),
             "holdIds": [e["holdId"]], "startSec": e["startSec"],
             "endSec": e["endSec"], "observations": {"limb": e["limb"], "holdId": e["holdId"],
             "observedSec": round(e["observedSec"], 3),
             "lowVisibilitySec": round(e["lowVisibilitySec"], 3)}} for i, e in enumerate(events, 1)]


def _decode(contours, pose, dims):
    tracks = pose["frames"]
    frames = []
    previous = dict.fromkeys(LIMBS)
    for index, track in enumerate(tracks):
        if not contours or track["camera"]["state"] != "aligned":
            limbs = {name: {"state": "mapUnavailable"} for name in LIMBS}
            previous = dict.fromkeys(LIMBS)
        elif not track["keypoints"]:
            limbs = {name: {"state": "unknown"} for name in LIMBS}
        else:
            limbs = {name: limb_observation(tracks, index, indices, contours, dims, previous[name])
                     for name, indices in LIMBS.items()}
            for name, obs in limbs.items():
                # Leaving in transit ends the preference for the old hold.
                if obs["state"] == "moving":
                    previous[name] = None
                elif "holdId" in obs:
                    previous[name] = obs["holdId"]
        frames.append({"t": track["t"], "limbs": limbs})
    return {"frames": frames, "events": contact_intervals(frames, pose["video"]["durationSec"])}


def match_contacts(wall: dict, pose: dict) -> dict:
    """Decode on every hold, then again on the route's holds when a route colour is supported.
    On a dense wall most wrong events are neighbours of a route hold that the limb really uses."""
    dims = np.float32([wall["video"]["width"], wall["video"]["height"]])
    contours = {h["id"]: np.float32(h["polygon"]) * dims for h in wall["holds"]}
    result = _decode(contours, pose, dims)
    route = infer_route(wall, result)
    scope = "all"
    if route["status"] == "hypothesis":
        selected = set(route["holdIds"])
        result = _decode({k: c for k, c in contours.items() if k in selected}, pose, dims)
        scope = "route"
    return {**result, "holdScope": scope, "route": route}


def infer_route(wall: dict, contacts: dict) -> dict:
    if "route" in contacts:
        # match_contacts already chose the route from contacts on the whole wall.
        return contacts["route"]
    holds = {hold["id"]: hold for hold in wall["holds"]}
    first_seen = {}
    for event in contacts["events"]:
        hold_id = event["observations"]["holdId"]
        first_seen[hold_id] = min(first_seen.get(hold_id, event["startSec"]), event["startSec"])
    colors = Counter(holds[k]["color"] for k in first_seen if holds[k]["color"] != "unknown")
    candidates = {}
    # The repetition condition requires two different holds in each half of the observed progression.
    if len(first_seen) >= 4:
        candidates = _color_evidence(holds, first_seen, wall["video"])
    passing = [color for color, evidence in candidates.items() if evidence["passes"]]
    selected = passing[0] if len(passing) == 1 else None
    return {
        "status": "hypothesis" if selected else "unknown",
        "color": selected,
        "holdIds": [k for k, h in holds.items() if h["color"] == selected],
        "supportHoldIds": [k for k in first_seen if holds[k]["color"] == selected],
        "observedHoldIds": sorted(first_seen),
        "distinctHoldColorCounts": dict(colors),
        "dominantColorShare": round(max(colors.values(), default=0) / max(1, len(first_seen)), 3),
        "colorEvidence": candidates,
        "method": "localColorRecurrence",
    }


def _color_evidence(holds: dict, first_seen: dict[str, float], video: dict) -> dict:
    """Check recurrence over time relative to the colors locally available on the wall."""
    midpoint = (min(first_seen.values()) + max(first_seen.values())) / 2
    neighborhoods = []
    for hold_id, time in first_seen.items():
        center = holds[hold_id]
        # Keep the wall's actual aspect ratio when measuring distances between normalized points.
        def distance(other):
            return hypot((other["x"] - center["x"]) * video["width"],
                         (other["y"] - center["y"]) * video["height"])

        nearby = sorted(holds.values(), key=distance)[:12]
        histogram = Counter(neighbor["color"] for neighbor in nearby)
        neighborhoods.append((center["color"], int(time > midpoint), histogram, len(nearby)))

    evidence = {}
    for color in HOLD_COLORS:
        observed = [0, 0]
        expected = [0.0, 0.0]
        probabilities = []
        for actual, half, histogram, size in neighborhoods:
            chance = histogram[color] / size
            observed[half] += int(actual == color)
            expected[half] += chance
            probabilities.append(chance)
        count = sum(observed)
        if not count:
            continue
        # This tail measures rarity under the local random-draw assumptions.
        adjusted_tail = min(1.0, float(poisson_binom.sf(count - 1, probabilities)) * len(HOLD_COLORS))
        repeats = all(n >= 2 and n > baseline for n, baseline in zip(observed, expected, strict=True))
        evidence[color] = {"observedByHalf": observed, "expectedByHalf": [round(x, 3) for x in expected],
                           "adjustedNullTail": round(adjusted_tail, 5), "passes": repeats and adjusted_tail <= 0.05}
    return evidence


def movement(frames, dimensions):
    angles = {joint: [] for joint in JOINTS}
    hips = []
    for frame in frames:
        points = frame["keypoints"]
        if not points:
            continue
        if visible(points[23]) and visible(points[24]):
            hips.append((np.array(points[23][:2]) + points[24][:2]) / 2)
        coords = np.asarray(points)[:, :2] * dimensions
        for joint, (a, b, c) in JOINTS.items():
            if not all(visible(points[i]) for i in (a, b, c)):
                continue
            v, w = coords[a] - coords[b], coords[c] - coords[b]
            norm = np.linalg.norm(v) * np.linalg.norm(w)
            if norm > 0:
                degrees = np.degrees(np.arccos(np.clip(np.dot(v, w) / norm, -1, 1)))
                angles[joint].append(degrees)
    result = {"jointAngles2dDeg": {
        joint: {"first": round(float(series[0])), "last": round(float(series[-1])),
                "min": round(float(min(series))), "median": round(float(np.median(series))),
                "max": round(float(max(series))), "visibleSamples": len(series)}
        for joint, series in angles.items() if series}}
    if hips:
        result["hipCenterInImage"] = {"firstXY": hips[0].round(4).tolist(),
                                      "lastXY": hips[-1].round(4).tolist(),
                                      "visibleSamples": len(hips)}
    return result


def find_episodes(wall: dict, pose: dict, contacts: dict, route: dict) -> dict:
    video = pose["video"]
    frames = pose["frames"]
    events = contacts["events"]
    duration = video["durationSec"]
    dimensions = np.array([video["width"], video["height"]])
    windows = []
    for index in range(ceil(duration / 3)):
        start, end = index * 3, min((index + 1) * 3, duration)
        selected = [f for f in frames if start <= f["t"] < end]
        matched = [f for f in contacts["frames"] if start <= f["t"] < end]
        active = [e for e in events if e["endSec"] > start and e["startSec"] < end]
        torso_samples = sum(bool(f["keypoints"]) and all(visible(f["keypoints"][i]) for i in (11, 12, 23, 24))
                           for f in selected)
        aligned = all(f["camera"]["state"] == "aligned" for f in selected)
        window = {"id": f"window-{index + 1}", "type": "movementWindow",
                  "usableForAdvice": torso_samples >= max(2, ceil(len(selected) / 2)),
                  "holdIds": sorted({e["observations"]["holdId"] for e in active}) if aligned else [],
                  "startSec": start, "endSec": end, "observations": {
                      "sampleCount": len(selected), "poseSamples": sum(bool(f["keypoints"]) for f in selected),
                      "visibleTorsoSamples": torso_samples,
                      "wallAlignmentSamples": dict(Counter(f["camera"]["state"] for f in selected)),
                      "limbStates": {l: dict(Counter(f["limbs"][l]["state"] for f in matched)) for l in LIMBS},
                      "contactIds": [e["id"] for e in active], **movement(selected, dimensions)}}
        windows.append(window)
    camera_counts = Counter(f["camera"]["state"] for f in frames)
    coverage = {"samples": len(frames), "sampleFps": pose["sampleFps"],
                "poseSamples": sum(bool(f["keypoints"]) for f in frames),
                "visibleTorsoSamples": sum(w["observations"]["visibleTorsoSamples"] for w in windows),
                "wallAlignmentSamples": dict(camera_counts),
                "tentativeContacts": len(events), "holdCount": len(wall["holds"])}
    limitations = []
    if camera_counts["shifted"]:
        limitations.append("Камера смещается относительно начальной карты. Привязка к зацепкам в эти интервалы отключена.")
    if camera_counts["unverified"]:
        limitations.append("На части записи не удалось проверить неподвижность стены.")
    if coverage["poseSamples"] < len(frames):
        limitations.append("На части записи положение спортсмена не определено.")
    if coverage["visibleTorsoSamples"] < coverage["poseSamples"] / 2:
        limitations.append("Плечи и таз одновременно видны менее чем в половине отсчётов с позой.")
    if not wall["holds"]:
        limitations.append("На начальных кадрах не найдены зацепки.")
    if not events:
        limitations.append("Нет устойчивых наблюдений контакта конечности с зацепкой.")
    if route["status"] == "unknown":
        limitations.append("Цвет и состав трассы по наблюдаемым движениям не определены.")
    summary = {"id": "attempt-summary", "type": "attemptSummary", "usableForAdvice": False,
               "holdIds": [], "startSec": 0, "endSec": duration,
               "observations": coverage}
    timeline = sorted([*windows, *events], key=lambda e: (e["startSec"], e["type"]))
    return {"schemaVersion": 1, "durationSec": duration, "video": video, "holds": wall["holds"],
            "events": [summary, *timeline], "coverage": coverage, "route": route, "limitations": limitations,
            "interpretation": "Контакты предполагаются по близости в 2D. Углы и координаты таза измерены в плоскости изображения. Положение тела вне кадра, нагрузка и захват не наблюдаются."}
