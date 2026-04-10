$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -match '^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)' -and
    $_.PrefixOrigin -ne 'WellKnown' -and
    $_.ValidLifetime -gt 0
  } |
  Sort-Object InterfaceMetric, SkipAsSource |
  Select-Object -ExpandProperty IPAddress -First 1

if (-not $addresses) {
  $addresses = "127.0.0.1"
}

Write-Host "Starting Next dev server on $addresses:3000"
pnpm exec next dev --hostname $addresses
