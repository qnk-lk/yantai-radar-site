#!/usr/bin/env bash
set -euo pipefail

RUNS_DIR="${RUNS_DIR:-/home/ubuntu/.openclaw/cron/runs}"
OUTPUT_PATH="${OUTPUT_PATH:-/var/www/qn-message.com/latest.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RECRUITMENT_INPUT="${RECRUITMENT_INPUT:-/var/www/qn-message.com/recruitment-leads-aggregate.json}"
SALES_INTEL_OUTPUT="${SALES_INTEL_OUTPUT:-/var/www/qn-message.com/sales-intel.json}"

python3 "$SCRIPT_DIR/openclaw_summary_to_latest_json.py" \
  --runs-dir "$RUNS_DIR" \
  --output "$OUTPUT_PATH"

node "$PROJECT_ROOT/scripts/build-sales-intel.mjs" \
  --radar "$OUTPUT_PATH" \
  --recruitment "$RECRUITMENT_INPUT" \
  --output "$SALES_INTEL_OUTPUT"
