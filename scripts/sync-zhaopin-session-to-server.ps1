param(
  [string]$Server = "ubuntu@129.226.217.104",
  [int]$Port = 22,
  [string]$IdentityFile = "$HOME\\.ssh\\yantai_radar_deploy",
  [string]$LocalOutput = ".tmp/zhaopin-session.json",
  [string]$RemotePath = "/home/ubuntu/yantai-radar-site/secrets/zhaopin-session.json"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LocalPath = if ([System.IO.Path]::IsPathRooted($LocalOutput)) { $LocalOutput } else { Join-Path $ProjectRoot $LocalOutput }

Write-Host "Exporting Zhaopin session from local browser..."
& node (Join-Path $ProjectRoot "scripts\\export-zhaopin-session.mjs") --output $LocalPath
if ($LASTEXITCODE -ne 0) {
  throw "Failed to export local Zhaopin session."
}

Write-Host "Uploading session file to server..."
& ssh -i $IdentityFile -p $Port $Server "mkdir -p /home/ubuntu/yantai-radar-site/secrets"
& scp -i $IdentityFile -P $Port $LocalPath "${Server}:$RemotePath"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload Zhaopin session to server."
}

Write-Host "Session synced to server: $RemotePath"
