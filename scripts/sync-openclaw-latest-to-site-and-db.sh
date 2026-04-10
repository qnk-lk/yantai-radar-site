#!/usr/bin/env bash
set -euo pipefail

RUNS_DIR="${RUNS_DIR:-/home/ubuntu/.openclaw/cron/runs}"
OUTPUT_PATH="${OUTPUT_PATH:-/var/www/qn-message.com/latest.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

python3 "$SCRIPT_DIR/openclaw_summary_to_latest_json.py" \
  --runs-dir "$RUNS_DIR" \
  --output "$OUTPUT_PATH"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key radar \
  --input "$OUTPUT_PATH" \
  --source "openclaw-cron-summary"
