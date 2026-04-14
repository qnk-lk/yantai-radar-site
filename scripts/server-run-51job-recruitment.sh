#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/yantai-radar-site}"
DEBUG_URL="${DEBUG_URL:-http://127.0.0.1:9223}"
OUTPUT_FILE="${OUTPUT_FILE:-/var/www/qn-message.com/recruitment-leads-51job.json}"
STATUS_FILE="${STATUS_FILE:-/var/www/qn-message.com/recruitment-leads-status.json}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/openclaw-bridge/51job-recruitment.log}"
TMP_OUTPUT="${TMP_OUTPUT:-/tmp/51job-recruitment-leads.json}"
MAX_COMPANIES="${MAX_COMPANIES:-10}"
KEYWORDS="${KEYWORDS:-MES,WMS,QMS,智能制造}"
PLATFORM_NAME="前程无忧"

mkdir -p "$(dirname "$LOG_FILE")"

timestamp() {
  TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S CST'
}

write_status() {
  local state="$1"
  local note="$2"
  node "$PROJECT_ROOT/scripts/update-platform-status.mjs" \
    --file "$STATUS_FILE" \
    --platform "$PLATFORM_NAME" \
    --status "$state" \
    --note "$note"
}

{
  echo "[$(timestamp)] 51job recruitment run started"

  node "$PROJECT_ROOT/scripts/collect-51job-recruitment-leads.mjs" \
    --debug-url "$DEBUG_URL" \
    --output "$TMP_OUTPUT" \
    --max-companies "$MAX_COMPANIES" \
    --keywords "$KEYWORDS"

  python3 - <<'PY' "$TMP_OUTPUT"
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
coverage = payload.get("platformCoverage") or []
status = coverage[0].get("status") if coverage else ""
if status == "blocked":
    raise SystemExit(3)
PY

  cp "$TMP_OUTPUT" "$OUTPUT_FILE"
  node "$PROJECT_ROOT/server/import-document.mjs" \
    --key recruitmentLeads51job \
    --input "$TMP_OUTPUT" \
    --source "51job-server-run"

  write_status "ok" "前程无忧服务器定时采集成功。"
  echo "[$(timestamp)] 51job recruitment run completed"
} >>"$LOG_FILE" 2>&1 || {
  rc=$?
  if [[ $rc -eq 3 ]]; then
    write_status "blocked" "前程无忧触发访问限制或返回异常，需检查浏览器环境。"
  else
    write_status "error" "前程无忧服务器定时采集失败，请查看日志。"
  fi
  exit "$rc"
}
