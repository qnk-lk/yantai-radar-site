param(
  [int]$Port = 9225,
  [string]$ProfileDir = ".tmp/xiaohongshu-chrome-profile",
  [string]$Url = "https://www.xiaohongshu.com/search_result?keyword=MES&type=51"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([System.IO.Path]::IsPathRooted($ProfileDir)) {
  $ProfilePath = $ProfileDir
} else {
  $ProfilePath = Join-Path $ProjectRoot $ProfileDir
}

New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null

try {
  $Version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 1
  Write-Host "Chrome remote debugging is already running on port $Port."
  Write-Host "Browser: $($Version.Browser)"

  try {
    $EncodedUrl = [System.Uri]::EscapeDataString($Url)
    Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$Port/json/new?$EncodedUrl" -TimeoutSec 2 | Out-Null
    Write-Host "Opened Xiaohongshu in the debugging Chrome window: $Url"
  } catch {
    Write-Host "Reuse the existing debugging Chrome window and open: $Url"
  }

  exit 0
} catch {
  # Continue and launch a dedicated Chrome profile below.
}

$ChromeCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Google\\Chrome\\Application\\chrome.exe"),
  (Join-Path $env:ProgramFiles "Google\\Chrome\\Application\\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\\Chrome\\Application\\chrome.exe")
)

$ChromePath = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $ChromePath) {
  $ChromeProcess = Get-Process chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.Path } |
    Select-Object -First 1

  if ($ChromeProcess) {
    $ChromePath = $ChromeProcess.Path
  }
}

if (-not $ChromePath) {
  throw "Chrome executable was not found. Install Google Chrome or pass a valid browser manually."
}

$Arguments = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$ProfilePath",
  "--new-window",
  $Url
)

Start-Process -FilePath $ChromePath -ArgumentList $Arguments

Write-Host "Started Chrome with remote debugging on port $Port."
Write-Host "Profile: $ProfilePath"
Write-Host "Login to Xiaohongshu in this Chrome window, then run: pnpm xiaohongshu:collect"
