param(
  [string]$HostName = "129.226.217.104",
  [string]$UserName = "ubuntu",
  [string]$KeyPath = "$HOME\.ssh\yantai_radar_deploy",
  [string]$SiteDir = "/var/www/qn-message.com",
  [string]$RuntimeDir = "/home/ubuntu/yantai-radar-site"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".tmp")) {
  New-Item -ItemType Directory ".tmp" | Out-Null
}

$siteArchive = ".tmp\site-out.tar.gz"
$runtimeArchive = ".tmp\runtime-code.tar.gz"

Remove-Item $siteArchive, $runtimeArchive -ErrorAction SilentlyContinue

pnpm build

tar `
  --exclude latest.json `
  --exclude competitors.json `
  --exclude sales-intel.json `
  --exclude sales-intel-history.json `
  --exclude recruitment-leads-status.json `
  --exclude 'recruitment-leads*.json' `
  --exclude 'social-signals*.json' `
  -czf $siteArchive -C out .

tar `
  --exclude 'server/data' `
  --exclude 'server/data/*' `
  --exclude 'server/**/*.sqlite' `
  --exclude 'server/**/*.sqlite-*' `
  --exclude 'server/**/*.db' `
  --exclude 'server/**/*.db-*' `
  --exclude 'scripts/__pycache__' `
  -czf $runtimeArchive server scripts deploy package.json pnpm-lock.yaml

scp -i $KeyPath -P 22 $siteArchive $runtimeArchive "${UserName}@${HostName}:/tmp/"

$remoteCommand = @"
set -e
sudo mkdir -p "$SiteDir"
sudo rm -rf "$SiteDir/_next"
sudo tar -xzf /tmp/site-out.tar.gz -C "$SiteDir"
mkdir -p "$RuntimeDir"
tar -xzf /tmp/runtime-code.tar.gz -C "$RuntimeDir"
cd "$RuntimeDir"
pnpm install --prod --frozen-lockfile
pnpm audit --prod
sudo systemctl restart radar-api.service
sudo systemctl is-active radar-api.service
"@

ssh -i $KeyPath -p 22 "${UserName}@${HostName}" $remoteCommand
