#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/yantai-radar-site}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/openclaw-bridge/recruitment-platforms.log}"
PLATFORM_LIMIT="${PLATFORM_LIMIT:-3}"
LEAD_LIMIT="${LEAD_LIMIT:-10}"
KEYWORDS="${KEYWORDS:-MES,WMS,QMS,智能制造}"
AGGREGATE_OUTPUT="${AGGREGATE_OUTPUT:-/var/www/qn-message.com/recruitment-leads-aggregate.json}"
RADAR_LATEST_INPUT="${RADAR_LATEST_INPUT:-/var/www/qn-message.com/latest.json}"
SALES_INTEL_OUTPUT="${SALES_INTEL_OUTPUT:-/var/www/qn-message.com/sales-intel.json}"

mkdir -p "$(dirname "$LOG_FILE")"

timestamp() {
  TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S CST'
}

read_lead_count() {
  local json_file="$1"
  node -e "const fs=require('fs');const payload=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(Array.isArray(payload.leads)?payload.leads.length:0)" "$json_file"
}

PLATFORMS=(
  "BOSS直聘|$PROJECT_ROOT/scripts/server-run-boss-recruitment.sh|/var/www/qn-message.com/recruitment-leads.json"
  "智联招聘|$PROJECT_ROOT/scripts/server-run-zhaopin-recruitment.sh|/var/www/qn-message.com/recruitment-leads-zhaopin.json"
  "前程无忧|$PROJECT_ROOT/scripts/server-run-51job-recruitment.sh|/var/www/qn-message.com/recruitment-leads-51job.json"
  "小红书|$PROJECT_ROOT/scripts/server-run-xiaohongshu-signals.sh|/var/www/qn-message.com/social-signals-xiaohongshu.json"
)

{
  echo "[$(timestamp)] recruitment dispatcher started"
  echo "platform limit: $PLATFORM_LIMIT"
  echo "lead limit: $LEAD_LIMIT"

  mapfile -t SELECTED_PLATFORMS < <(printf '%s\n' "${PLATFORMS[@]}" | shuf | head -n "$PLATFORM_LIMIT")

  total_leads=0
  selected_names=()
  aggregate_inputs=()

  for index in "${!SELECTED_PLATFORMS[@]}"; do
    entry="${SELECTED_PLATFORMS[$index]}"
    IFS='|' read -r platform_name runner_script output_file <<<"$entry"
    remaining=$((LEAD_LIMIT - total_leads))
    platforms_left=$(( ${#SELECTED_PLATFORMS[@]} - index ))

    if (( remaining <= 0 )); then
      echo "lead limit reached before $platform_name"
      break
    fi

    per_platform_limit=$(( (remaining + platforms_left - 1) / platforms_left ))

    echo "[$(timestamp)] running $platform_name with per-platform limit $per_platform_limit and remaining limit $remaining"
    if MAX_COMPANIES="$per_platform_limit" KEYWORDS="$KEYWORDS" bash "$runner_script"; then
      if [[ -f "$output_file" ]]; then
        lead_count="$(read_lead_count "$output_file")"
      else
        lead_count=0
      fi

      total_leads=$((total_leads + lead_count))
      selected_names+=("$platform_name")
      aggregate_inputs+=("$output_file")
      echo "[$(timestamp)] $platform_name completed with $lead_count leads; total=$total_leads"
    else
      rc=$?
      echo "[$(timestamp)] $platform_name failed with exit code $rc"
    fi
  done

  if (( ${#aggregate_inputs[@]} > 0 )); then
    aggregate_args=()
    for input_file in "${aggregate_inputs[@]}"; do
      aggregate_args+=("--input" "$input_file")
    done

    IFS=','
    selected_csv="${selected_names[*]}"
    unset IFS

    node "$PROJECT_ROOT/scripts/aggregate-recruitment-platforms.mjs" \
      --output "$AGGREGATE_OUTPUT" \
      --lead-limit "$LEAD_LIMIT" \
      --platform-limit "$PLATFORM_LIMIT" \
      --selected-platforms "$selected_csv" \
      "${aggregate_args[@]}"

    node "$PROJECT_ROOT/server/import-document.mjs" \
      --key recruitmentLeadsAggregate \
      --input "$AGGREGATE_OUTPUT" \
      --source "recruitment-dispatcher"

    node "$PROJECT_ROOT/scripts/build-sales-intel.mjs" \
      --radar "$RADAR_LATEST_INPUT" \
      --recruitment "$AGGREGATE_OUTPUT" \
      --output "$SALES_INTEL_OUTPUT"

    node "$PROJECT_ROOT/server/import-document.mjs" \
      --key salesIntel \
      --input "$SALES_INTEL_OUTPUT" \
      --source "sales-intel-builder"
  fi

  echo "[$(timestamp)] recruitment dispatcher completed"
} >>"$LOG_FILE" 2>&1
