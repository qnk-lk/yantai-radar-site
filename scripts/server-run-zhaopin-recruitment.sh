#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/yantai-radar-site}"
DEBUG_URL="${DEBUG_URL:-http://127.0.0.1:9223}"
SESSION_FILE="${SESSION_FILE:-$PROJECT_ROOT/secrets/zhaopin-session.json}"
OUTPUT_FILE="${OUTPUT_FILE:-/var/www/qn-message.com/recruitment-leads-zhaopin.json}"
STATUS_FILE="${STATUS_FILE:-/var/www/qn-message.com/recruitment-leads-status.json}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/openclaw-bridge/zhaopin-recruitment.log}"
TMP_OUTPUT="${TMP_OUTPUT:-/tmp/zhaopin-recruitment-leads.json}"
MAX_COMPANIES="${MAX_COMPANIES:-10}"
KEYWORDS="${KEYWORDS:-MES,WMS,QMS,智能制造}"
PLATFORM_NAME="智联招聘"

mkdir -p "$(dirname "$SESSION_FILE")"
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
  echo "[$(timestamp)] zhaopin recruitment run started"

  if [[ ! -f "$SESSION_FILE" ]]; then
    write_status "blocked" "服务器缺少智联招聘登录会话文件，需重新导出并同步 session。"
    echo "session file not found: $SESSION_FILE"
    exit 2
  fi

  node "$PROJECT_ROOT/scripts/collect-zhaopin-recruitment-leads.mjs" \
    --debug-url "$DEBUG_URL" \
    --session-file "$SESSION_FILE" \
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
    --key recruitmentLeadsZhaopin \
    --input "$TMP_OUTPUT" \
    --source "zhaopin-server-run"

  if [[ "${SKIP_SALES_INTEL_SYNC:-0}" != "1" ]]; then
    ADD_PLATFORM="$PLATFORM_NAME" bash "$PROJECT_ROOT/scripts/server-refresh-sales-intel.sh"
  fi

  write_status "ok" "智联招聘服务器定时采集成功。"
  echo "[$(timestamp)] zhaopin recruitment run completed"
} >>"$LOG_FILE" 2>&1 || {
  rc=$?
  if [[ $rc -eq 3 ]]; then
    write_status "blocked" "智联招聘会话已失效或触发校验，需要刷新登录态。"
  else
    write_status "error" "智联招聘服务器定时采集失败，请查看日志。"
  fi
  exit "$rc"
}
