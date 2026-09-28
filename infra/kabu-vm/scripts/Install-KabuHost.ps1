#Requires -Version 5.1
<#
.SYNOPSIS
  Prepare Azure Windows VM as kabu + kabu-bridge host (no order secrets in repo).

.NOTES
  Run elevated on the VM after kabuステーション is installed and API icon is green.
  Does NOT write sendorder. Does NOT write passwords.
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$RepoBridgeRelative = "tools\kabu-bridge",
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Error "Run elevated PowerShell as Administrator."
}

Write-Host "==> Ensure Node.js 20+"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node not found. Install LTS from https://nodejs.org and re-run."
  exit 1
}
node -v

if (-not $RepoRoot) {
  # Common: copy tools/kabu-bridge to C:\kabu-bridge manually
  $RepoRoot = ""
}

New-Item -ItemType Directory -Force -Path $BridgeRoot | Out-Null

if ($RepoRoot -and (Test-Path (Join-Path $RepoRoot $RepoBridgeRelative))) {
  Write-Host "==> Sync bridge sources from repo"
  $src = Join-Path $RepoRoot $RepoBridgeRelative
  Copy-Item -Path (Join-Path $src "*") -Destination $BridgeRoot -Recurse -Force
}

if (-not (Test-Path (Join-Path $BridgeRoot "package.json"))) {
  Write-Host "Place tools/kabu-bridge contents into $BridgeRoot first."
  Write-Host "Then create $BridgeRoot\.env from .env.example (never commit)."
  exit 1
}

Push-Location $BridgeRoot
try {
  npm install
} finally {
  Pop-Location
}

$envPath = Join-Path $BridgeRoot ".env"
if (-not (Test-Path $envPath)) {
  $example = Join-Path $BridgeRoot ".env.example"
  if (Test-Path $example) {
    Copy-Item $example $envPath
    Write-Host "==> Created $envPath — fill secrets locally (API password, BRIDGE_SECRET, USER_ID)."
  }
}

# Restrict .env ACL to Administrators + current user
if (Test-Path $envPath) {
  icacls $envPath /inheritance:r | Out-Null
  icacls $envPath /grant:r "Administrators:(F)" "SYSTEM:(F)" "$env:USERNAME:(R)" | Out-Null
  Write-Host "==> Restricted ACL on .env"
}

# Guest firewall: never accept kabu API from non-loopback (defense in depth vs NSG)
Write-Host "==> Windows Firewall: block inbound 18080/18081 (any profile)"
foreach ($port in @(18080, 18081)) {
  $ruleName = "Block-KabuApi-Inbound-$port"
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Block -Direction Inbound | Out-Null
  } else {
    New-NetFirewallRule -DisplayName $ruleName `
      -Direction Inbound -Action Block -Protocol TCP -LocalPort $port `
      -Profile Any -Enabled True | Out-Null
  }
}

Write-Host @"

==> Next (manual)
1. Edit $envPath
   - KABU_BASE_URL=http://localhost:18081  (verify first)
   - KABU_API_PASSWORD=...
   - AQUA_BRIDGE_URL=https://www.aquacore.net
   - AQUA_BRIDGE_SECRET=... (same as SWA STOCK_KABU_BRIDGE_SECRET)
   - AQUA_USER_ID=...
   - KABU_ALLOW_LIVE_ORDERS=0
2. Start kabuステーション, confirm API icon green
3. cd $BridgeRoot; npm run probe; npm run sync; npm run trade
4. Task Scheduler (market hours): sync every 15m, trade every 15m — see docs/STOCK_KABU_AZURE_VM.md

SECURITY: Do not open inbound TCP 18080/18081 on NSG or firewall.
"@
