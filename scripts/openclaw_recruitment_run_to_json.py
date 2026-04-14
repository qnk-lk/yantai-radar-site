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


DEFAULT_STRATEGY = {
    "cities": ["烟台", "青岛"],
    "targetCompanyLimit": 10,
    "primaryPlatforms": ["BOSS直聘", "智联招聘"],
    "fallbackPlatforms": ["前程无忧", "猎聘", "齐鲁人才网"],
    "keywords": ["MES", "WMS", "QMS", "智能制造", "数字化工厂", "工业互联网"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert an OpenClaw recruitment signal run into recruitment-leads.json."
    )
    parser.add_argument("--input", help="Path to the OpenClaw agent JSON result.")
    parser.add_argument(
        "--cron-runs-file",
        help="Path to an OpenClaw cron run JSONL file whose latest finished summary contains the JSON payload.",
    )
    parser.add_argument("--output", required=True, help="Path to the recruitment-leads.json output.")
    parser.add_argument(
        "--allowed-cities",
        default="烟台,青岛",
        help="Comma-separated city allowlist. Leads outside the list are dropped.",
    )
    parser.add_argument(
        "--max-companies",
        type=int,
        default=10,
        help="Maximum number of unique company leads to keep.",
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
        raise RuntimeError(f"No finished recruitment summary found in {runs_path}")

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
        f"Could not parse recruitment payload from {runs_path}. Details: {'; '.join(parse_errors)}"
    )


def as_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def as_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def normalize_evidence(value: Any) -> dict[str, str]:
    return {
        "source": as_text(value.get("source")) if isinstance(value, dict) else "",
        "url": as_text(value.get("url")) if isinstance(value, dict) else "",
        "note": as_text(value.get("note")) if isinstance(value, dict) else "",
    }


def normalize_job(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}

    return {
        "platform": as_text(value.get("platform")),
        "jobTitle": as_text(value.get("jobTitle")),
        "city": as_text(value.get("city")),
        "salary": as_text(value.get("salary")),
        "publishedAt": as_text(value.get("publishedAt")),
        "url": as_text(value.get("url")),
        "keywordHits": as_text_list(value.get("keywordHits")),
        "descriptionEvidence": as_text(value.get("descriptionEvidence")),
    }


def normalize_platform_coverage(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}

    count = value.get("effectiveCompanyCount")
    if not isinstance(count, int):
        count = 0

    return {
        "platform": as_text(value.get("platform")),
        "status": as_text(value.get("status")) or "limited",
        "querySummary": as_text(value.get("querySummary")),
        "effectiveCompanyCount": count,
        "note": as_text(value.get("note")),
    }


def normalize_lead(value: Any, rank: int) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}

    matched_jobs = value.get("matchedJobs")
    evidence = value.get("evidence")
    matched_job_items = matched_jobs if isinstance(matched_jobs, list) else []
    evidence_items = evidence if isinstance(evidence, list) else []

    return {
        "rank": rank,
        "companyName": as_text(value.get("companyName")),
        "city": as_text(value.get("city")),
        "companyCategory": as_text(value.get("companyCategory")) or "待判断",
        "leadType": as_text(value.get("leadType")) or "待判断",
        "leadStrength": as_text(value.get("leadStrength")) or "中",
        "signalSummary": as_text(value.get("signalSummary")),
        "inferredNeed": as_text(value.get("inferredNeed")),
        "matchedKeywords": as_text_list(value.get("matchedKeywords")),
        "matchedJobs": [
            item
            for item in (normalize_job(job) for job in matched_job_items)
            if item["jobTitle"] or item["url"] or item["descriptionEvidence"]
        ],
        "evidence": [
            item
            for item in (normalize_evidence(record) for record in evidence_items)
            if item["source"] or item["url"] or item["note"]
        ],
        "recommendedAction": as_text(value.get("recommendedAction")),
        "riskNotes": as_text(value.get("riskNotes")),
    }


def normalize_strategy(value: Any, allowed_cities: list[str], max_companies: int) -> dict[str, Any]:
    strategy = dict(DEFAULT_STRATEGY)
    if isinstance(value, dict):
        strategy.update(
            {
                "cities": as_text_list(value.get("cities")) or allowed_cities,
                "targetCompanyLimit": value.get("targetCompanyLimit") if isinstance(value.get("targetCompanyLimit"), int) else max_companies,
                "primaryPlatforms": as_text_list(value.get("primaryPlatforms")) or strategy["primaryPlatforms"],
                "fallbackPlatforms": as_text_list(value.get("fallbackPlatforms")) or strategy["fallbackPlatforms"],
                "keywords": as_text_list(value.get("keywords")) or strategy["keywords"],
            }
        )

    strategy["cities"] = allowed_cities
    strategy["targetCompanyLimit"] = max_companies
    return strategy


def normalize_payload(
    payload: dict[str, Any], updated_at: str, allowed_cities: list[str], max_companies: int
) -> dict[str, Any]:
    raw_leads = payload.get("leads")
    if not isinstance(raw_leads, list):
        raise ValueError("leads must be a list")

    city_set = set(allowed_cities)
    seen_companies: set[str] = set()
    leads: list[dict[str, Any]] = []

    for raw_lead in raw_leads:
        lead = normalize_lead(raw_lead, len(leads) + 1)
        company_key = f"{lead['city']}::{lead['companyName']}"

        if not lead["companyName"] or lead["city"] not in city_set or company_key in seen_companies:
            continue

        seen_companies.add(company_key)
        leads.append(lead)

        if len(leads) >= max_companies:
            break

    platform_coverage = payload.get("platformCoverage")
    platform_coverage_items = platform_coverage if isinstance(platform_coverage, list) else []

    return {
        "updatedAt": updated_at,
        "status": f"已同步 {len(leads)} 家招聘信号反推线索公司。",
        "note": "该数据独立于日报和同行地图，只用于根据招聘岗位反推烟台、青岛制造业数字化线索。",
        "strategy": normalize_strategy(payload.get("strategy"), allowed_cities, max_companies),
        "platformCoverage": [
            normalize_platform_coverage(item)
            for item in platform_coverage_items
        ],
        "leads": leads,
    }


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)

    if args.input:
        parsed, generated_at = load_from_agent_result(Path(args.input))
    else:
        parsed, generated_at = load_from_cron_runs(Path(args.cron_runs_file))

    allowed_cities = [city.strip() for city in args.allowed_cities.split(",") if city.strip()]
    max_companies = max(1, min(args.max_companies, 30))
    normalized = normalize_payload(parsed, format_updated_at(generated_at), allowed_cities, max_companies)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
