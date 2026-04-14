#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
DEBUG_PORT="${DEBUG_PORT:-9223}"
PROFILE_DIR="${PROFILE_DIR:-$HOME/boss-chrome-profile}"
CHROME_BIN="${CHROME_BIN:-$(command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)}"
START_URL="${START_URL:-https://www.zhipin.com/}"

if [[ -z "$CHROME_BIN" ]]; then
  echo "chrome binary not found"
  exit 1
fi

mkdir -p "$PROFILE_DIR"

exec xvfb-run --auto-servernum --server-num="${DISPLAY_NUM#:}" --server-args="-screen 0 1440x960x24 -nolisten tcp" \
  "$CHROME_BIN" \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  --disable-gpu \
  --no-sandbox \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$DEBUG_PORT" \
  --user-data-dir="$PROFILE_DIR" \
  "$START_URL"
