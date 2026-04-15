#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/yantai-radar-site}"
DEBUG_URL="${DEBUG_URL:-http://127.0.0.1:9223}"
SESSION_FILE="${SESSION_FILE:-$PROJECT_ROOT/secrets/xiaohongshu-session.json}"
OUTPUT_FILE="${OUTPUT_FILE:-/var/www/qn-message.com/social-signals-xiaohongshu.json}"
STATUS_FILE="${STATUS_FILE:-/var/www/qn-message.com/recruitment-leads-status.json}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/openclaw-bridge/xiaohongshu-signals.log}"
TMP_OUTPUT="${TMP_OUTPUT:-/tmp/xiaohongshu-sales-signals.json}"
MAX_SIGNALS="${MAX_SIGNALS:-${MAX_COMPANIES:-10}}"
QUERIES="${QUERIES:-烟台 MES,青岛 MES,MES 招聘,MES实施顾问,MES 上线,WMS 改造,QMS 质量追溯,工厂 信息化,制造业 数字化 改造,ERP MES 打通}"
PLATFORM_NAME="小红书"

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
  echo "[$(timestamp)] xiaohongshu signal run started"

  if [[ ! -f "$SESSION_FILE" ]]; then
    write_status "blocked" "服务器缺少小红书登录会话文件，需重新导出并同步 session。"
    echo "session file not found: $SESSION_FILE"
    exit 2
  fi

  node "$PROJECT_ROOT/scripts/collect-xiaohongshu-sales-signals.mjs" \
    --debug-url "$DEBUG_URL" \
    --session-file "$SESSION_FILE" \
    --output "$TMP_OUTPUT" \
    --max-signals "$MAX_SIGNALS" \
    --queries "$QUERIES"

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
    --key socialSignalsXiaohongshu \
    --input "$TMP_OUTPUT" \
    --source "xiaohongshu-server-run"

  write_status "ok" "小红书服务器采集成功。"
  echo "[$(timestamp)] xiaohongshu signal run completed"
} >>"$LOG_FILE" 2>&1 || {
  rc=$?
  if [[ $rc -eq 3 ]]; then
    write_status "blocked" "小红书会话已失效或触发校验，需要刷新登录态。"
  else
    write_status "error" "小红书服务器采集失败，请查看日志。"
  fi
  exit "$rc"
}
