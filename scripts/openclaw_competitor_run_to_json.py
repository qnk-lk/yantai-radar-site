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
    parser.add_argument("--input", required=True, help="Path to the OpenClaw agent JSON result.")
    parser.add_argument("--output", required=True, help="Path to the competitors.json output.")
    parser.add_argument(
        "--allowed-cities",
        default="",
        help="Comma-separated city allowlist. When set, competitors outside the list are dropped.",
    )
    return parser.parse_args()


def strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
      lines = stripped.splitlines()
      if len(lines) >= 3:
          return "\n".join(lines[1:-1]).strip()
    return stripped


def format_updated_at(timestamp_ms: int | None) -> str:
    if not timestamp_ms:
        return "未知时间"

    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).astimezone(SHANGHAI_TZ)
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")


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
    input_path = Path(args.input)
    output_path = Path(args.output)

    raw = json.loads(input_path.read_text(encoding="utf-8"))
    payloads = raw.get("result", {}).get("payloads", [])

    if not payloads:
        raise RuntimeError("OpenClaw run did not contain payloads")

    text = payloads[0].get("text", "")
    if not text:
        raise RuntimeError("OpenClaw payload text is empty")

    if "usage limit" in text.lower():
        raise RuntimeError(text.strip())

    parsed = json.loads(strip_code_fence(text))
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

    generated_at = (
        raw.get("result", {})
        .get("meta", {})
        .get("systemPromptReport", {})
        .get("generatedAt")
        or raw.get("ts")
    )
    updated_at = format_updated_at(generated_at)
    normalized = normalize_payload(parsed, updated_at, note, status)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
