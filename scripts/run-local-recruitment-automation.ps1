param(
  [int]$MaxCompanies = 10,
  [string]$Keywords = "MES,WMS,QMS,SMART_MANUFACTURING"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$BossOutput = Join-Path $ProjectRoot ".tmp\\boss-recruitment-leads.json"
$OutputPath = Join-Path $ProjectRoot "public\\recruitment-leads.json"

Write-Host "Local recruitment automation starting..."

Write-Host "Running BOSS collector..."
& pnpm boss:collect -- --output $BossOutput --max-companies $MaxCompanies --keywords $Keywords
if ($LASTEXITCODE -ne 0) {
  throw "BOSS collector failed."
}

Write-Host "Importing merged data into local DB..."
Copy-Item -Force $BossOutput $OutputPath
& node server/import-document.mjs --key recruitmentLeads --input $OutputPath --source "local-automation"

Write-Host "Local recruitment automation completed."
