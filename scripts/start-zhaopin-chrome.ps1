param(
  [int]$Port = 9224,
  [string]$ProfileDir = ".tmp/zhaopin-chrome-profile",
  [string]$Url = "https://passport.zhaopin.com/login"
)

$ErrorActionPreference = "Stop"
$ScriptPath = Join-Path $PSScriptRoot "start-boss-chrome.ps1"

& powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -Port $Port -ProfileDir $ProfileDir -Url $Url
if ($LASTEXITCODE -ne 0) {
  throw "Failed to start Zhaopin Chrome profile."
}
