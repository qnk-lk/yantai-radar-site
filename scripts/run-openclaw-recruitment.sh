#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/.openclaw/workspace}"
OPENCLAW_BIN="${OPENCLAW_BIN:-$HOME/.npm-global/bin/openclaw}"
PROMPT_PATH="${PROMPT_PATH:-$PROJECT_ROOT/openclaw-config/recruitment-leads-prompt-yantai-qingdao.txt}"
OUTPUT_PATH="${OUTPUT_PATH:-/tmp/openclaw-recruitment-run.json}"
TEMP_OUTPUT="${OUTPUT_PATH}.tmp"

if [[ ! -x "$OPENCLAW_BIN" ]]; then
  echo "openclaw binary not found: $OPENCLAW_BIN"
  exit 1
fi

if [[ ! -f "$PROMPT_PATH" ]]; then
  echo "recruitment prompt not found: $PROMPT_PATH"
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
"$SCRIPT_DIR/sync-openclaw-recruitment-to-db.sh"
