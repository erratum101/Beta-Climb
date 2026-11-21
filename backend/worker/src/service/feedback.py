"""Let the coach select episodes, then bind each suggestion to measured evidence."""

import json
import re
from math import ceil
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from service.llm import ChatClient, ChatMessage
from service.technique import COACH_PROMPT, PRINCIPLES, SOURCES


Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=450)]


class Suggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: Literal["feet", "body", "sequence", "balance", "setup"]
    title: Text
    problem: Text
    action: Text
    evidenceRefs: list[str] = Field(min_length=1, max_length=12)
    principleIds: list[str] = Field(min_length=1, max_length=len(PRINCIPLES))


class Feedback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    moments: list[object] = Field(max_length=12)


def _athlete_context(profile: dict) -> dict:
    context = {key: profile[key] for key in ("experience", "disciplines") if key in profile}
    height = profile.get("heightCm")
    if profile.get("consentAccepted") is True and type(height) is int and 120 <= height <= 250:
        lower = height - height % 5
        context["heightCmRange"] = [lower, min(lower + 4, 250)]
    return context


LIMBS = {"leftHand": "Левая кисть", "rightHand": "Правая кисть", "leftFoot": "Левая стопа", "rightFoot": "Правая стопа"}
JOINTS = {"leftElbow": "левого локтя", "rightElbow": "правого локтя", "leftKnee": "левого колена", "rightKnee": "правого колена"}


def _measurements(event: dict, known_holds: set) -> dict:
    observations = event["observations"]
    if event["type"] == "tentativeContact":
        limb, hold, seconds = (observations.get(k) for k in ("limb", "holdId", "observedSec"))
        if limb in LIMBS and hold in known_holds and seconds and seconds > 0:
            return {"proximity2d": {"limb": limb, "holdId": hold, "observedSec": seconds}}
    if event["type"] != "movementWindow":
        return {}
    minimum = max(2, ceil(observations["sampleCount"] / 2))
    values = {}
    hip = observations.get("hipCenterInImage")
    if hip and hip["visibleSamples"] >= minimum:
        values["hipCenterInImage"] = hip
    for joint, angles in observations.get("jointAngles2dDeg", {}).items():
        if joint in JOINTS and angles["visibleSamples"] >= minimum:
            values[f"jointAngles2dDeg.{joint}"] = {key: angles[key] for key in ("first", "last", "visibleSamples")}
    return values


def _describe(field: str, value: dict) -> str:
    if field == "proximity2d":
        seconds = f"{value['observedSec']:g}".replace(".", ",")
        return f"{LIMBS[value['limb']]} на изображении была рядом с контуром зацепки в сумме {seconds} с."
    if field == "hipCenterInImage":
        x0, y0 = value["firstXY"]
        x1, y1 = value["lastXY"]
        dx, dy = round((x1 - x0) * 100), round((y1 - y0) * 100)
        displacement = []
        if dx:
            displacement.append(f"{'вправо' if dx > 0 else 'влево'} на {abs(dx)}% ширины кадра")
        if dy:
            displacement.append(f"{'вниз' if dy > 0 else 'вверх'} на {abs(dy)}% высоты кадра")
        if not displacement:
            return "На первом и последнем видимых кадрах центр таза находится почти в одной точке изображения."
        return f"От первого до последнего видимого кадра центр таза сместился {' и '.join(displacement)}."
    joint = JOINTS[field.split(".")[1]]
    return (f"На изображении угол {joint} составил {value['first']}° в первом видимом кадре "
            f"и {value['last']}° в последнем.")


def _referenced_events(events: list[dict], known_holds: set) -> tuple[list[dict], dict]:
    """Only movement measurements can anchor advice. Visibility and IDs remain context."""
    timeline, references = [], {}
    for event in events:
        if event["usableForAdvice"] is not True:
            timeline.append(event)
            continue
        values = _measurements(event, known_holds)
        measurements = {}
        for field, value in values.items():
            ref = f"{event['id']}/{field}"
            references[ref] = (event, field, value)
            measurements[ref] = {"value": value, "visibleObservation": _describe(field, value)}
        context = {k: v for k, v in event["observations"].items()
                   if k not in {"hipCenterInImage", "jointAngles2dDeg", "limb", "holdId", "observedSec"}}
        timeline.append({k: v for k, v in event.items() if k != "observations"} |
                        {"context": context, "measurements": measurements})
    return timeline, references


def _card(suggestion: Suggestion, index: int, references: dict, holds: set, duration: float) -> dict:
    if any(ref not in references for ref in suggestion.evidenceRefs):
        raise ValueError("unknown_evidence")
    referenced = [references[key] for key in dict.fromkeys(suggestion.evidenceRefs)]
    evidence = {event["id"]: event for event, _, _ in referenced}
    anchor, field, value = referenced[0]
    start, end = anchor["startSec"], anchor["endSec"]
    if not 0 <= start < end <= duration:
        raise ValueError("invalid_window")
    text = [suggestion.title, suggestion.problem, suggestion.action]
    if any(re.search(r"https?://|www\.|\b(?:h\d+|(?:window|contact)-\d+|attempt-summary)\b", part, re.I) for part in text):
        raise ValueError("technical_reference_in_text")
    principles = list(dict.fromkeys(suggestion.principleIds))
    if any(key not in PRINCIPLES for key in principles):
        raise ValueError("unknown_principle")
    source_ids = dict.fromkeys(source for key in principles for source in PRINCIPLES[key]["sourceIds"])
    sources = [{"id": key, **SOURCES[key]} for key in source_ids]
    # Static highlights are visible for the whole card. Gaps inside a contact cannot be localized here.
    highlight = {measurement["holdId"] for event, kind, measurement in referenced if kind == "proximity2d"
                 and event["startSec"] <= start and event["endSec"] >= end
                 and measurement["observedSec"] + 0.001 >= event["endSec"] - event["startSec"]}
    return {
        "id": f"moment-{index + 1}", "category": suggestion.category, "title": suggestion.title,
        "timeSec": start, "startSec": start, "endSec": end, "problem": suggestion.problem,
        "happened": _describe(field, value), "action": suggestion.action, "primary": index == 0,
        "holdIds": sorted(highlight & holds), "evidenceIds": list(evidence),
        "anchorObservation": {"field": field, "value": value}, "principleIds": principles, "sources": sources,
    }


def _validate_cards(answer: str, references: dict, holds: set, duration: float) -> tuple[list, list[str]]:
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", answer.strip(), re.DOTALL | re.IGNORECASE)
    try:
        response = Feedback.model_validate_json(fenced.group(1) if fenced else answer)
    except ValidationError:
        return [], ["invalid_envelope"]
    cards, issues = [], []
    anchors = set()
    for raw in response.moments:
        try:
            item = Suggestion.model_validate(raw)
            card = _card(item, len(cards), references, holds, duration)
        except ValidationError:
            issues.append("invalid_card")
            continue
        except ValueError as error:
            issues.append(str(error))
            continue
        anchor = card["evidenceIds"][0]
        if anchor in anchors or len(cards) >= 3:
            issues.append("redundant_card")
            continue
        anchors.add(anchor)
        cards.append(card)
    return cards, issues


async def build_feedback(timeline: dict, profile: dict, client: ChatClient) -> dict:
    duration = timeline["durationSec"]
    holds = timeline["holds"]
    known_holds = {hold["id"] for hold in holds}
    events, references = _referenced_events(timeline["events"], known_holds)
    result = {"durationSec": duration, "holds": holds, "route": timeline["route"],
              "moments": [], "primaryAction": "", "limitations": list(timeline["limitations"])}
    if not references:
        result["limitations"].append("В записи нет достаточно хорошо видимого эпизода для совета.")
        return result
    compact_holds = [{key: hold[key] for key in ("id", "x", "y", "color") if key in hold} for hold in holds]
    context = {
        "durationSec": duration, "holds": compact_holds, "route": timeline["route"], "events": events,
        "limitations": timeline["limitations"], "interpretation": timeline.get("interpretation", ""),
        "athlete": _athlete_context(profile), "principles": PRINCIPLES, "sources": SOURCES,
        "exampleEvidenceRef": next(iter(references)),
    }
    messages: list[ChatMessage] = [
        {"role": "system", "content": COACH_PROMPT},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False, separators=(",", ":"))},
    ]
    cards, issues = _validate_cards(await client.complete(messages), references, known_holds, duration)
    if issues and not cards:
        messages.append({"role": "user", "content": json.dumps({"validationIssues": sorted(set(issues))})})
        cards, issues = _validate_cards(await client.complete(messages), references, known_holds, duration)
        if not cards:
            result["limitations"].append("Повторная проверка не подтвердила ни одного совета "
                                         "с надёжной привязкой к эпизоду. Доступны результаты распознавания.")
    if cards and issues:
        result["limitations"].append("Часть предложенных замечаний не прошла проверку привязки к наблюдениям "
                                     "и источникам. Показаны проверенные эпизоды.")
    result["moments"] = cards
    if cards:
        result["primaryAction"] = cards[0]["action"]
    return result
