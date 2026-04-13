#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


try:
    SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
except ZoneInfoNotFoundError:
    SHANGHAI_TZ = timezone(timedelta(hours=8), name="CST")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert an OpenClaw competitor research run into the site competitors.json format."
    )
    parser.add_argument("--input", help="Path to the OpenClaw agent JSON result.")
    parser.add_argument(
        "--cron-runs-file",
        help="Path to an OpenClaw cron run JSONL file whose latest finished summary contains the JSON payload.",
    )
    parser.add_argument("--output", required=True, help="Path to the competitors.json output.")
    parser.add_argument(
        "--allowed-cities",
        default="",
        help="Comma-separated city allowlist. When set, competitors outside the list are dropped.",
    )
    args = parser.parse_args()

    if bool(args.input) == bool(args.cron_runs_file):
        parser.error("Exactly one of --input or --cron-runs-file must be provided.")

    return args


def strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            return "\n".join(lines[1:-1]).strip()
    return stripped


def parse_json_payload(text: str) -> dict[str, Any]:
    candidate = strip_code_fence(text)

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as first_error:
        decoder = json.JSONDecoder()

        for index, char in enumerate(candidate):
            if char not in "[{":
                continue

            try:
                parsed, end = decoder.raw_decode(candidate[index:])
            except json.JSONDecodeError:
                continue

            trailing = candidate[index + end :].strip()
            if not trailing:
                break
        else:
            raise first_error

    if not isinstance(parsed, dict):
        raise ValueError("OpenClaw output must decode to a JSON object")

    return parsed


def format_updated_at(timestamp_ms: int | None) -> str:
    if not timestamp_ms:
        return "未知时间"

    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).astimezone(SHANGHAI_TZ)
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")


def load_from_agent_result(input_path: Path) -> tuple[dict[str, Any], int | None]:
    raw = json.loads(input_path.read_text(encoding="utf-8"))
    payloads = raw.get("result", {}).get("payloads", [])

    if not payloads:
        raise RuntimeError("OpenClaw run did not contain payloads")

    text = payloads[0].get("text", "")
    if not text:
        raise RuntimeError("OpenClaw payload text is empty")

    if "usage limit" in text.lower():
        raise RuntimeError(text.strip())

    generated_at = (
        raw.get("result", {})
        .get("meta", {})
        .get("systemPromptReport", {})
        .get("generatedAt")
        or raw.get("ts")
    )

    return parse_json_payload(text), generated_at


def resolve_session_path(session_id: str) -> Path | None:
    agents_root = Path.home() / ".openclaw" / "agents"

    direct_path = agents_root / "main" / "sessions" / f"{session_id}.jsonl"
    if direct_path.exists():
        return direct_path

    for candidate in agents_root.glob(f"*/sessions/{session_id}.jsonl"):
        if candidate.exists():
            return candidate

    return None


def load_from_session_file(session_path: Path) -> dict[str, Any]:
    latest_text: str | None = None

    with session_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            payload = json.loads(line)
            if payload.get("type") != "message":
                continue

            message = payload.get("message", {})
            if message.get("role") != "assistant":
                continue

            for content_item in message.get("content", []):
                if content_item.get("type") == "text" and content_item.get("text"):
                    latest_text = content_item["text"]

    if latest_text is None:
        raise RuntimeError(f"No assistant text found in session file {session_path}")

    return parse_json_payload(latest_text)


def load_from_cron_runs(runs_path: Path) -> tuple[dict[str, Any], int | None]:
    latest_run: dict[str, Any] | None = None
    latest_timestamp: int | None = None

    with runs_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            payload = json.loads(line)

            if payload.get("action") != "finished":
                continue

            summary = payload.get("summary")
            timestamp = payload.get("ts") or payload.get("runAtMs")

            if not summary or not timestamp:
                continue

            if latest_timestamp is None or int(timestamp) > latest_timestamp:
                latest_run = payload
                latest_timestamp = int(timestamp)

    if latest_run is None:
        raise RuntimeError(f"No finished competitor summary found in {runs_path}")

    latest_summary = latest_run.get("summary", "")
    if "usage limit" in latest_summary.lower():
        raise RuntimeError(latest_summary.strip())

    session_id = latest_run.get("sessionId")
    session_path = resolve_session_path(session_id) if session_id else None

    parse_errors: list[str] = []

    if session_path is not None:
        try:
            return load_from_session_file(session_path), latest_timestamp
        except Exception as error:
            parse_errors.append(f"session {session_path}: {error}")

    try:
        return parse_json_payload(latest_summary), latest_timestamp
    except Exception as error:
        parse_errors.append(f"summary: {error}")

    raise RuntimeError(
        f"Could not parse competitor payload from {runs_path}. Details: {'; '.join(parse_errors)}"
    )


def normalize_payload(
    payload: dict[str, Any], updated_at: str, note: str, status: str
) -> dict[str, Any]:
    competitors = payload.get("competitors")
    if not isinstance(competitors, list):
        raise ValueError("competitors must be a list")

    baseline = payload.get("baseline")
    if not isinstance(baseline, dict):
        raise ValueError("baseline must be an object")

    return {
        "updatedAt": updated_at,
        "status": status,
        "note": note,
        "baseline": baseline,
        "competitors": competitors,
    }


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    if args.input:
        parsed, generated_at = load_from_agent_result(Path(args.input))
    else:
        parsed, generated_at = load_from_cron_runs(Path(args.cron_runs_file))
    allowed_cities = {
        city.strip() for city in args.allowed_cities.split(",") if city.strip()
    }
    note = "排序按烟台向外展开；后续可继续补更多城市和公司证据。"
    status = f"已同步 {len(parsed.get('competitors', []))} 家制造服务同行公司。"
    if allowed_cities:
        filtered = [
            item
            for item in parsed.get("competitors", [])
            if item.get("city") in allowed_cities
        ]
        for index, item in enumerate(filtered, start=1):
            item["rank"] = index
            if item.get("city") == "烟台":
                item["distanceTier"] = "烟台本地"
            elif item.get("city") == "青岛":
                item["distanceTier"] = "青岛重点"
        parsed["competitors"] = filtered
        city_summary = " / ".join(sorted(allowed_cities, key=lambda value: ["烟台", "青岛"].index(value) if value in {"烟台", "青岛"} else 99))
        note = f"当前结果只保留 {city_summary} 两地同行；后续可继续补强公司证据与最新动态。"
        status = f"已同步 {len(filtered)} 家{city_summary}制造服务同行公司。"

    updated_at = format_updated_at(generated_at)
    normalized = normalize_payload(parsed, updated_at, note, status)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
