#!/usr/bin/env bash
set -euo pipefail

RUNS_DIR="${RUNS_DIR:-/home/ubuntu/.openclaw/cron/runs}"
TEMP_DIR="${TEMP_DIR:-/tmp/yantai-radar-openclaw}"
TEMP_JSON="$TEMP_DIR/latest.from-openclaw.json"
TEMP_SALES_INTEL_JSON="$TEMP_DIR/sales-intel.from-openclaw.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RECRUITMENT_INPUT="${RECRUITMENT_INPUT:-/var/www/qn-message.com/recruitment-leads-aggregate.json}"

mkdir -p "$TEMP_DIR"

python3 "$SCRIPT_DIR/openclaw_summary_to_latest_json.py" \
  --runs-dir "$RUNS_DIR" \
  --output "$TEMP_JSON"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key radar \
  --input "$TEMP_JSON" \
  --source "openclaw-cron-summary"

node "$PROJECT_ROOT/scripts/build-sales-intel.mjs" \
  --radar "$TEMP_JSON" \
  --recruitment "$RECRUITMENT_INPUT" \
  --output "$TEMP_SALES_INTEL_JSON"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key salesIntel \
  --input "$TEMP_SALES_INTEL_JSON" \
  --source "sales-intel-builder"
