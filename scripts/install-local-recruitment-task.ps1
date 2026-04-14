param(
  [string]$TaskName = "YantaiRecruitmentLocal930",
  [string]$RunAt = "09:30"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ScriptPath = Join-Path $ProjectRoot "scripts\\run-local-recruitment-automation.ps1"
$PowerShellPath = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"

if (-not (Test-Path $ScriptPath)) {
  throw "Automation script not found: $ScriptPath"
}

$Action = "`"$PowerShellPath`" -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""

schtasks /Create /F /SC DAILY /ST $RunAt /TN $TaskName /TR $Action | Out-Null

Write-Host "Scheduled task created: $TaskName"
Write-Host "Time: $RunAt (local)"
Write-Host "Action: $ScriptPath"
