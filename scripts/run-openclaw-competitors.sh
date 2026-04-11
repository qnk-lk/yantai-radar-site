#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/.openclaw/workspace}"
OPENCLAW_BIN="${OPENCLAW_BIN:-$HOME/.npm-global/bin/openclaw}"
PROMPT_PATH="${PROMPT_PATH:-$SCRIPT_DIR/openclaw_competitor_prompt_yantai_qingdao.txt}"
OUTPUT_PATH="${OUTPUT_PATH:-/tmp/openclaw-competitor-run.json}"
TEMP_OUTPUT="${OUTPUT_PATH}.tmp"

if [[ ! -x "$OPENCLAW_BIN" ]]; then
  echo "openclaw binary not found: $OPENCLAW_BIN"
  exit 1
fi

if [[ ! -f "$PROMPT_PATH" ]]; then
  echo "competitor prompt not found: $PROMPT_PATH"
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
rm -f "$TEMP_OUTPUT"
trap 'rm -f "$TEMP_OUTPUT"' EXIT

PROMPT_CONTENT="$(cat "$PROMPT_PATH")"

(
  cd "$WORKSPACE_DIR"
  "$OPENCLAW_BIN" agent \
    --agent main \
    --json \
    --timeout 1800 \
    --message "$PROMPT_CONTENT" > "$TEMP_OUTPUT"
)

mv "$TEMP_OUTPUT" "$OUTPUT_PATH"
"$SCRIPT_DIR/sync-openclaw-competitors-to-db.sh"
