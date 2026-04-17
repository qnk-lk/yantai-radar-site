#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/yantai-radar-site}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/openclaw-bridge/recruitment-platforms.log}"
PLATFORM_LIMIT="${PLATFORM_LIMIT:-3}"
LEAD_LIMIT="${LEAD_LIMIT:-10}"
PLATFORM_CANDIDATE_LIMIT="${PLATFORM_CANDIDATE_LIMIT:-8}"
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
  echo "platform candidate limit: $PLATFORM_CANDIDATE_LIMIT"
  echo "lead limit: $LEAD_LIMIT"

  mapfile -t SELECTED_PLATFORMS < <(printf '%s\n' "${PLATFORMS[@]}" | shuf)

  total_leads=0
  selected_names=()
  for index in "${!SELECTED_PLATFORMS[@]}"; do
    if (( index >= PLATFORM_LIMIT && total_leads >= LEAD_LIMIT )); then
      echo "lead limit reached after $index platform(s)"
      break
    fi

    entry="${SELECTED_PLATFORMS[$index]}"
    IFS='|' read -r platform_name runner_script output_file <<<"$entry"
    remaining=$((LEAD_LIMIT - total_leads))
    planned_platforms_left=$(( PLATFORM_LIMIT - index ))

    if (( remaining <= 0 )); then
      remaining=1
    fi

    if (( planned_platforms_left < 1 )); then
      planned_platforms_left=1
      echo "[$(timestamp)] fallback platform enabled because current total is below lead limit"
    fi

    per_platform_limit=$(( (remaining + planned_platforms_left - 1) / planned_platforms_left ))
    candidate_limit="$per_platform_limit"
    if (( candidate_limit < PLATFORM_CANDIDATE_LIMIT )); then
      candidate_limit="$PLATFORM_CANDIDATE_LIMIT"
    fi
    if (( candidate_limit > LEAD_LIMIT )); then
      candidate_limit="$LEAD_LIMIT"
    fi

    echo "[$(timestamp)] running $platform_name with candidate limit $candidate_limit and remaining target $remaining"
    if SKIP_SALES_INTEL_SYNC=1 MAX_COMPANIES="$candidate_limit" KEYWORDS="$KEYWORDS" bash "$runner_script"; then
      if [[ -f "$output_file" ]]; then
        lead_count="$(read_lead_count "$output_file")"
      else
        lead_count=0
      fi

      total_leads=$((total_leads + lead_count))
      selected_names+=("$platform_name")
      echo "[$(timestamp)] $platform_name completed with $lead_count leads; total=$total_leads"
    else
      rc=$?
      echo "[$(timestamp)] $platform_name failed with exit code $rc"
    fi
  done

  if (( ${#selected_names[@]} > 0 )); then
    IFS=','
    selected_csv="${selected_names[*]}"
    unset IFS

    SET_SELECTED_PLATFORMS="$selected_csv" \
    LEAD_LIMIT="$LEAD_LIMIT" \
    PLATFORM_LIMIT="$PLATFORM_LIMIT" \
    RADAR_INPUT="$RADAR_LATEST_INPUT" \
    AGGREGATE_OUTPUT="$AGGREGATE_OUTPUT" \
    SALES_INTEL_OUTPUT="$SALES_INTEL_OUTPUT" \
    bash "$PROJECT_ROOT/scripts/server-refresh-sales-intel.sh"
  fi

  echo "[$(timestamp)] recruitment dispatcher completed"
} >>"$LOG_FILE" 2>&1
