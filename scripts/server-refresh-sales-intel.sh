#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/yantai-radar-site}"
SITE_ROOT="${SITE_ROOT:-/var/www/qn-message.com}"
RADAR_INPUT="${RADAR_INPUT:-$SITE_ROOT/latest.json}"
AGGREGATE_OUTPUT="${AGGREGATE_OUTPUT:-$SITE_ROOT/recruitment-leads-aggregate.json}"
SALES_INTEL_OUTPUT="${SALES_INTEL_OUTPUT:-$SITE_ROOT/sales-intel.json}"
SALES_INTEL_HISTORY_OUTPUT="${SALES_INTEL_HISTORY_OUTPUT:-$SITE_ROOT/sales-intel-history.json}"
LEAD_LIMIT="${LEAD_LIMIT:-10}"
PLATFORM_LIMIT="${PLATFORM_LIMIT:-3}"
SET_SELECTED_PLATFORMS="${SET_SELECTED_PLATFORMS:-}"
ADD_PLATFORM="${ADD_PLATFORM:-}"

PLATFORM_ENTRIES=(
  "BOSS直聘|recruitmentLeads|$SITE_ROOT/recruitment-leads.json"
  "智联招聘|recruitmentLeadsZhaopin|$SITE_ROOT/recruitment-leads-zhaopin.json"
  "前程无忧|recruitmentLeads51job|$SITE_ROOT/recruitment-leads-51job.json"
  "小红书|socialSignalsXiaohongshu|$SITE_ROOT/social-signals-xiaohongshu.json"
)

compact_csv() {
  printf '%s' "$1" | tr '，' ',' | tr -d '\r' | awk -F',' '
    {
      for (i = 1; i <= NF; i++) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i)
        if ($i != "") {
          print $i
        }
      }
    }
  ' | awk '!seen[$0]++' | paste -sd ',' -
}

read_existing_selected_platforms() {
  if [[ ! -f "$AGGREGATE_OUTPUT" ]]; then
    return
  fi

  node - <<'NODE' "$AGGREGATE_OUTPUT"
const fs = require("fs");
const filePath = process.argv[2];
try {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const items = Array.isArray(payload?.strategy?.selectedPlatforms)
    ? payload.strategy.selectedPlatforms
    : [];
  console.log(items.filter(Boolean).join(","));
} catch {
  process.exit(0);
}
NODE
}

resolve_selected_platforms() {
  if [[ -n "$SET_SELECTED_PLATFORMS" ]]; then
    compact_csv "$SET_SELECTED_PLATFORMS"
    return
  fi

  local existing
  existing="$(read_existing_selected_platforms || true)"

  if [[ -n "$ADD_PLATFORM" ]]; then
    compact_csv "${existing},${ADD_PLATFORM}"
    return
  fi

  compact_csv "$existing"
}

count_leads() {
  local json_file="$1"
  node -e "const fs=require('fs');const payload=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const items=Array.isArray(payload.leads)?payload.leads:[];console.log(items.length)" "$json_file"
}

SELECTED_PLATFORMS="$(resolve_selected_platforms)"

if [[ -z "$SELECTED_PLATFORMS" ]]; then
  echo "No selected platforms resolved; skipping sales intel refresh."
  exit 0
fi

IFS=',' read -r -a SELECTED_PLATFORM_LIST <<<"$SELECTED_PLATFORMS"

aggregate_args=()
available_platforms=()

for entry in "${PLATFORM_ENTRIES[@]}"; do
  IFS='|' read -r platform_name document_key output_file <<<"$entry"
  should_include=0

  for selected_platform in "${SELECTED_PLATFORM_LIST[@]}"; do
    if [[ "$selected_platform" == "$platform_name" ]]; then
      should_include=1
      break
    fi
  done

  if [[ $should_include -ne 1 ]]; then
    continue
  fi

  node "$PROJECT_ROOT/server/export-document.mjs" \
    --key "$document_key" \
    --output "$output_file" >/dev/null

  if [[ ! -f "$output_file" ]]; then
    continue
  fi

  lead_count="$(count_leads "$output_file")"
  if [[ "$lead_count" -le 0 ]]; then
    continue
  fi

  aggregate_args+=("--input" "$output_file")
  available_platforms+=("$platform_name")
done

if [[ ${#aggregate_args[@]} -eq 0 ]]; then
  echo "No platform payloads available for selected platforms: $SELECTED_PLATFORMS"
  exit 0
fi

if [[ ! -f "$SALES_INTEL_HISTORY_OUTPUT" ]]; then
  node "$PROJECT_ROOT/server/export-document.mjs" \
    --key salesIntelHistory \
    --output "$SALES_INTEL_HISTORY_OUTPUT" >/dev/null || true
fi

IFS=','; selected_csv="${available_platforms[*]}"; unset IFS

node "$PROJECT_ROOT/scripts/aggregate-recruitment-platforms.mjs" \
  --output "$AGGREGATE_OUTPUT" \
  --history "$SALES_INTEL_HISTORY_OUTPUT" \
  --lead-limit "$LEAD_LIMIT" \
  --platform-limit "$PLATFORM_LIMIT" \
  --selected-platforms "$selected_csv" \
  "${aggregate_args[@]}"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key recruitmentLeadsAggregate \
  --input "$AGGREGATE_OUTPUT" \
  --source "sales-intel-sync"

node "$PROJECT_ROOT/scripts/build-sales-intel.mjs" \
  --radar "$RADAR_INPUT" \
  --recruitment "$AGGREGATE_OUTPUT" \
  --output "$SALES_INTEL_OUTPUT" \
  --history "$SALES_INTEL_HISTORY_OUTPUT"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key salesIntel \
  --input "$SALES_INTEL_OUTPUT" \
  --source "sales-intel-sync"

node "$PROJECT_ROOT/server/import-document.mjs" \
  --key salesIntelHistory \
  --input "$SALES_INTEL_HISTORY_OUTPUT" \
  --source "sales-intel-history"
