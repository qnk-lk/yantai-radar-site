#!/usr/bin/env bash
set -euo pipefail

INPUT_PATH="${INPUT_PATH:-/tmp/openclaw-competitor-run.json}"
OPENCLAW_JOBS_PATH="${OPENCLAW_JOBS_PATH:-$HOME/.openclaw/cron/jobs.json}"
OPENCLAW_RUNS_DIR="${OPENCLAW_RUNS_DIR:-$HOME/.openclaw/cron/runs}"
COMPETITOR_CRON_NAME="${COMPETITOR_CRON_NAME:-烟台 / 青岛制造服务同行地图}"
ALLOWED_CITIES="${ALLOWED_CITIES:-烟台,青岛}"
OUTPUT_PATH="${OUTPUT_PATH:-/var/www/qn-message.com/competitors.json}"
TEMP_DIR="${TEMP_DIR:-/tmp/yantai-radar-openclaw}"
TEMP_JSON="$TEMP_DIR/competitors.from-openclaw.json"
STATE_DIR="${STATE_DIR:-$TEMP_DIR/state}"
STAMP_FILE="$STATE_DIR/competitors-input.stamp"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CRON_RUNS_FILE=""
CURRENT_STAMP=""
CRON_TIMESTAMP=""
CRON_STAMP=""
INPUT_MTIME=""
INPUT_SIZE=""
INPUT_MTIME_MS=""
INPUT_STAMP=""
USE_INPUT_PATH="false"

if [[ -f "$INPUT_PATH" ]]; then
  if [[ ! -s "$INPUT_PATH" ]]; then
    echo "competitor input is empty, removing stale file and falling back to cron runs"
    rm -f "$INPUT_PATH"
  else
    INPUT_MTIME="$(stat -c '%Y' "$INPUT_PATH")"
    INPUT_SIZE="$(stat -c '%s' "$INPUT_PATH")"
    INPUT_MTIME_MS="$(( INPUT_MTIME * 1000 ))"
    INPUT_STAMP="input:${INPUT_MTIME}:${INPUT_SIZE}"
  fi
fi

if [[ -f "$OPENCLAW_JOBS_PATH" ]]; then

  CRON_JOB_ID="$(python3 - <<'PY' "$OPENCLAW_JOBS_PATH" "$COMPETITOR_CRON_NAME"
import json
import sys
from pathlib import Path

jobs_path = Path(sys.argv[1])
job_name = sys.argv[2]

jobs = json.loads(jobs_path.read_text(encoding="utf-8")).get("jobs", [])
for job in jobs:
    if job.get("name") == job_name:
        print(job.get("id", ""))
        break
PY
)"

  if [[ -z "$CRON_JOB_ID" ]]; then
    echo "competitor cron job not found: $COMPETITOR_CRON_NAME"
    exit 0
  fi

  CRON_RUNS_FILE="$OPENCLAW_RUNS_DIR/$CRON_JOB_ID.jsonl"

  if [[ ! -f "$CRON_RUNS_FILE" ]]; then
    echo "competitor cron runs file not found: $CRON_RUNS_FILE"
  else
    CRON_TIMESTAMP="$(python3 - <<'PY' "$CRON_RUNS_FILE"
import json
import sys
from pathlib import Path

runs_path = Path(sys.argv[1])
latest = None

with runs_path.open("r", encoding="utf-8") as handle:
    for line in handle:
        payload = json.loads(line)
        if payload.get("action") != "finished":
            continue
        stamp = payload.get("ts") or payload.get("runAtMs")
        if stamp is None:
            continue
        latest = int(stamp) if latest is None or int(stamp) > latest else latest

if latest is not None:
    print(latest)
PY
)"

    if [[ -n "$CRON_TIMESTAMP" ]]; then
      CRON_STAMP="cron:${CRON_TIMESTAMP}"
    fi
  fi
else
  echo "openclaw jobs file not found: $OPENCLAW_JOBS_PATH"
fi

if [[ -n "$INPUT_STAMP" && ( -z "$CRON_TIMESTAMP" || "$INPUT_MTIME_MS" -gt "$CRON_TIMESTAMP" ) ]]; then
  CURRENT_STAMP="$INPUT_STAMP"
  USE_INPUT_PATH="true"
elif [[ -n "$CRON_STAMP" ]]; then
  CURRENT_STAMP="$CRON_STAMP"
elif [[ -n "$INPUT_STAMP" ]]; then
  CURRENT_STAMP="$INPUT_STAMP"
  USE_INPUT_PATH="true"
else
  echo "competitor input and cron runs are both unavailable, skip"
  exit 0
fi

mkdir -p "$TEMP_DIR"
mkdir -p "$STATE_DIR"
LAST_STAMP=""
if [[ -f "$STAMP_FILE" ]]; then
  LAST_STAMP="$(cat "$STAMP_FILE")"
fi

if [[ "$CURRENT_STAMP" == "$LAST_STAMP" ]]; then
  echo "competitor input unchanged, skip"
  exit 0
fi

if [[ "$USE_INPUT_PATH" == "true" ]]; then
  python3 "$SCRIPT_DIR/openclaw_competitor_run_to_json.py" \
    --input "$INPUT_PATH" \
    --output "$TEMP_JSON" \
    --allowed-cities "$ALLOWED_CITIES"
else
  python3 "$SCRIPT_DIR/openclaw_competitor_run_to_json.py" \
    --cron-runs-file "$CRON_RUNS_FILE" \
    --output "$TEMP_JSON" \
    --allowed-cities "$ALLOWED_CITIES"
fi

cp "$TEMP_JSON" "$OUTPUT_PATH"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key competitors \
  --input "$TEMP_JSON" \
  --source "openclaw-competitor-run"

printf '%s' "$CURRENT_STAMP" > "$STAMP_FILE"
