#Requires -Version 5.1
# Flip LIVE gate for tomorrow. ASCII only.
$ErrorActionPreference = "Stop"
$path = "C:\kabu-bridge\.env"
if (-not (Test-Path $path)) { throw ".env missing" }
$lines = Get-Content $path
$out = foreach ($line in $lines) {
  if ($line -match '^\s*KABU_ALLOW_LIVE_ORDERS\s*=') {
    "KABU_ALLOW_LIVE_ORDERS=1"
  } else {
    $line
  }
}
Set-Content -Path $path -Value $out -Encoding ASCII
Get-Content $path | ForEach-Object {
  if ($_ -match '^\s*KABU_ALLOW_LIVE_ORDERS\s*=\s*(.*)$') {
    Write-Host ("LIVE_FLAG=" + $Matches[1].Trim())
  }
  if ($_ -match '^\s*KABU_BASE_URL\s*=\s*(.*)$') {
    Write-Host ("BASE_URL=" + $Matches[1].Trim())
  }
}
Write-Host "LIVE_FLIP_OK"
