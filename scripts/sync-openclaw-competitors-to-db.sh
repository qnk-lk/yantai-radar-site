#!/usr/bin/env bash
set -euo pipefail

INPUT_PATH="${INPUT_PATH:-/tmp/openclaw-competitor-run.json}"
ALLOWED_CITIES="${ALLOWED_CITIES:-烟台,青岛}"
OUTPUT_PATH="${OUTPUT_PATH:-/var/www/qn-message.com/competitors.json}"
TEMP_DIR="${TEMP_DIR:-/tmp/yantai-radar-openclaw}"
TEMP_JSON="$TEMP_DIR/competitors.from-openclaw.json"
STATE_DIR="${STATE_DIR:-$TEMP_DIR/state}"
STAMP_FILE="$STATE_DIR/competitors-input.stamp"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$INPUT_PATH" ]]; then
  echo "competitor input not found: $INPUT_PATH"
  exit 0
fi

if [[ ! -s "$INPUT_PATH" ]]; then
  echo "competitor input is empty, skip"
  exit 0
fi

mkdir -p "$TEMP_DIR"
mkdir -p "$STATE_DIR"

CURRENT_STAMP="$(stat -c '%Y:%s' "$INPUT_PATH")"
LAST_STAMP=""
if [[ -f "$STAMP_FILE" ]]; then
  LAST_STAMP="$(cat "$STAMP_FILE")"
fi

if [[ "$CURRENT_STAMP" == "$LAST_STAMP" ]]; then
  echo "competitor input unchanged, skip"
  exit 0
fi

python3 "$SCRIPT_DIR/openclaw_competitor_run_to_json.py" \
  --input "$INPUT_PATH" \
  --output "$TEMP_JSON" \
  --allowed-cities "$ALLOWED_CITIES"

cp "$TEMP_JSON" "$OUTPUT_PATH"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key competitors \
  --input "$TEMP_JSON" \
  --source "openclaw-competitor-run"

printf '%s' "$CURRENT_STAMP" > "$STAMP_FILE"
