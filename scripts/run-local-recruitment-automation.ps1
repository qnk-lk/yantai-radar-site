param(
  [int]$MaxCompanies = 10,
  [string]$Keywords = "MES,WMS,QMS,SMART_MANUFACTURING",
  [switch]$SkipBoss,
  [switch]$SkipOpenClaw
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$BossOutput = Join-Path $ProjectRoot ".tmp\\boss-recruitment-leads.json"
$OpenClawRun = Join-Path $ProjectRoot ".tmp\\openclaw-recruitment-run.json"
$OpenClawJson = Join-Path $ProjectRoot ".tmp\\openclaw-recruitment-leads.json"
$MergedOutput = Join-Path $ProjectRoot "public\\recruitment-leads.json"

Write-Host "Local recruitment automation starting..."

if (-not $SkipBoss) {
  Write-Host "Running BOSS collector..."
  & pnpm boss:collect -- --output $BossOutput --max-companies $MaxCompanies --keywords $Keywords
  if ($LASTEXITCODE -ne 0) {
    throw "BOSS collector failed."
  }
} else {
  Write-Host "Skipping BOSS collector."
}

if (-not $SkipOpenClaw) {
  $OpenClawCmd = Get-Command openclaw -ErrorAction SilentlyContinue
  if (-not $OpenClawCmd) {
    Write-Host "openclaw not found in PATH. Skipping OpenClaw run."
  } else {
    $PromptPath = Join-Path $ProjectRoot "openclaw-config\\recruitment-leads-prompt-yantai-qingdao.txt"
    if (-not (Test-Path $PromptPath)) {
      throw "OpenClaw prompt not found: $PromptPath"
    }

    Write-Host "Running OpenClaw recruitment task..."
    $PromptContent = Get-Content -Raw $PromptPath
    & openclaw agent --agent main --json --timeout 1800 --message $PromptContent | Out-File -FilePath $OpenClawRun -Encoding utf8

    Write-Host "Converting OpenClaw output..."
    & python scripts/openclaw_recruitment_run_to_json.py --input $OpenClawRun --output $OpenClawJson --max-companies $MaxCompanies
  }
} else {
  Write-Host "Skipping OpenClaw run."
}

Write-Host "Merging recruitment leads..."
& node scripts/merge-recruitment-leads.mjs --openclaw $OpenClawJson --boss $BossOutput --output $MergedOutput
if ($LASTEXITCODE -ne 0) {
  throw "Merge failed."
}

Write-Host "Importing merged data into local DB..."
& node server/import-document.mjs --key recruitmentLeads --input $MergedOutput --source "local-automation"

Write-Host "Local recruitment automation completed."
