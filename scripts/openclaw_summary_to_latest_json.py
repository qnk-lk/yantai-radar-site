#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
FOCUS_TEXT = "烟台优先，向青岛、威海、潍坊扩展，再补山东重点制造城市。"
SECTION_TITLES = {
    "今日高优先级销售线索": "high_priority",
    "潜在客户动态": "potential_leads",
    "重点企业 / 竞对动作": "watch_items",
    "今日未覆盖或证据不足的部分": "coverage_gaps",
    "明日跟进清单": "next_actions",
    "建议新增到潜在客户名单的对象": "accounts",
}


@dataclass
class RunSummary:
    summary: str
    timestamp_ms: int
    path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert the latest OpenClaw cron summary into the site latest.json format."
    )
    parser.add_argument(
        "--runs-dir",
        default="/home/ubuntu/.openclaw/cron/runs",
        help="Directory containing OpenClaw cron run JSONL files.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to the latest.json file that the radar site serves.",
    )
    return parser.parse_args()


def load_latest_summary(runs_dir: Path) -> RunSummary:
    latest: RunSummary | None = None

    for run_file in sorted(runs_dir.glob("*.jsonl"), key=lambda item: item.stat().st_mtime, reverse=True):
        with run_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                payload = json.loads(line)
                if payload.get("action") != "finished":
                    continue

                summary = payload.get("summary")
                timestamp_ms = payload.get("ts") or payload.get("runAtMs")

                if not summary or not timestamp_ms:
                    continue

                candidate = RunSummary(summary=summary, timestamp_ms=int(timestamp_ms), path=run_file)

                if latest is None or candidate.timestamp_ms > latest.timestamp_ms:
                    latest = candidate

    if latest is None:
        raise RuntimeError(f"No finished summary found in {runs_dir}")

    return latest


def parse_sections(markdown: str) -> dict[str, list[str]]:
    sections = {value: [] for value in SECTION_TITLES.values()}
    current_key: str | None = None
    current_item: str | None = None

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("## "):
            title = line[3:].strip()
            current_key = SECTION_TITLES.get(title)
            current_item = None
            continue

        if current_key is None:
            continue

        if line.startswith("- "):
            current_item = line[2:].strip()
            sections[current_key].append(current_item)
            continue

        if current_item is not None:
            sections[current_key][-1] = f"{sections[current_key][-1]} {line}".strip()

    return sections


def strip_prefix(value: str, prefix: str) -> str:
    return value[len(prefix) :].strip() if value.startswith(prefix) else value.strip()


def parse_priority_entry(item: str) -> dict[str, Any] | None:
    parts = [part.strip() for part in item.split("｜")]

    if len(parts) < 10:
        return None

    reason = parts[7] if len(parts) > 7 else ""
    return {
        "title": parts[0],
        "source": parts[1],
        "publishedAt": parts[2],
        "location": parts[3],
        "entity": parts[4],
        "demand": parts[5],
        "stage": parts[6],
        "reason": reason,
        "confidence": strip_prefix(parts[8], "可信度："),
        "score": strip_prefix(parts[9], "线索等级："),
        "action": strip_prefix(parts[10], "推荐动作：") if len(parts) > 10 else "",
    }


def parse_potential_entry(item: str) -> dict[str, Any]:
    parts = [part.strip() for part in item.split("｜")]

    if len(parts) < 8:
        return {"title": item}

    return {
        "title": parts[0],
        "source": parts[1],
        "publishedAt": parts[2],
        "location": parts[3],
        "entity": parts[4],
        "demand": parts[5],
        "stage": parts[6],
        "reason": parts[7],
        "confidence": strip_prefix(parts[8], "可信度：") if len(parts) > 8 else "",
        "score": strip_prefix(parts[9], "线索等级：") if len(parts) > 9 else "",
        "action": strip_prefix(parts[10], "推荐动作：") if len(parts) > 10 else "",
    }


def parse_watch_item(item: str) -> dict[str, Any]:
    parts = [part.strip() for part in item.split("｜")]

    if len(parts) < 6:
        return {"title": item}

    return {
        "title": parts[0],
        "source": parts[1],
        "publishedAt": parts[2],
        "location": parts[3],
        "entity": parts[4],
        "reason": parts[5],
        "confidence": strip_prefix(parts[6], "可信度：") if len(parts) > 6 else "",
    }


def parse_account(item: str) -> dict[str, Any] | None:
    if item == "今日暂无建议新增对象":
        return None

    return {
        "title": item,
        "action": "纳入名单",
        "reason": "来自 OpenClaw 日报的建议新增到潜在客户名单对象。",
    }


def build_status(sections: dict[str, list[str]], high_priority_count: int, potential_count: int) -> str:
    priority_notes = [item for item in sections["high_priority"] if parse_priority_entry(item) is None]

    if priority_notes:
        return priority_notes[0]

    if high_priority_count:
        return f"今日已同步 {high_priority_count} 条高优先级线索。"

    if potential_count:
        return f"今日高优先级线索为空，已同步 {potential_count} 条潜在线索。"

    return "OpenClaw 已完成抓取，但今日没有满足条件的新增线索。"


def build_note(sections: dict[str, list[str]], run_summary: RunSummary) -> str:
    if sections["coverage_gaps"]:
        first_gap = sections["coverage_gaps"][0]
        return f"当前已同步最新日报；仍需补查：{first_gap}"

    return f"已从 OpenClaw 最新日报自动同步，来源文件：{run_summary.path.name}"


def format_updated_at(timestamp_ms: int) -> str:
    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).astimezone(SHANGHAI_TZ)
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")


def build_payload(run_summary: RunSummary) -> dict[str, Any]:
    sections = parse_sections(run_summary.summary)

    high_priority = [entry for item in sections["high_priority"] if (entry := parse_priority_entry(item))]
    potential_leads = [parse_potential_entry(item) for item in sections["potential_leads"]]
    watch_items = [parse_watch_item(item) for item in sections["watch_items"]]
    next_actions = [item.split("：", 1)[1].strip() if "：" in item else item for item in sections["next_actions"]]
    accounts = [entry for item in sections["accounts"] if (entry := parse_account(item))]

    return {
        "updatedAt": format_updated_at(run_summary.timestamp_ms),
        "summary": {
            "focus": FOCUS_TEXT,
            "status": build_status(sections, len(high_priority), len(potential_leads)),
            "note": build_note(sections, run_summary),
        },
        "highPriority": high_priority,
        "potentialLeads": potential_leads,
        "watchItems": watch_items,
        "coverageGaps": sections["coverage_gaps"],
        "nextActions": next_actions,
        "accounts": accounts,
    }


def atomic_write_json(payload: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(output_path)


def main() -> int:
    args = parse_args()
    run_summary = load_latest_summary(Path(args.runs_dir))
    payload = build_payload(run_summary)
    atomic_write_json(payload, Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
