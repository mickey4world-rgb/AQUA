#Requires -Version 5.1
# ASCII-only. Azure Run Command oracle for kabu auto-trade ops.
# Usage (from laptop):
#   az vm run-command invoke -g rg-personal-apps-prod -n vm-kabu-aqua --command-id RunPowerShellScript --scripts "@infra/kabu-vm/scripts/Verify-KabuOpsOnVm.ps1"
param(
  [string]$SetupDir = "C:\kabu-setup",
  [string]$BridgeRoot = "C:\kabu-bridge"
)

$ErrorActionPreference = "Continue"
Write-Host "=== KABU OPS VERIFY ==="
Write-Host ("NOW_JST=" + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))

Write-Host "-- tasks --"
Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  $i = $_ | Get-ScheduledTaskInfo
  $u = $_.Principal.UserId
  Write-Host ("TASK " + $_.TaskName + " state=" + $_.State + " user=" + $u + " last=" + $i.LastRunTime + " result=" + $i.LastTaskResult)
}

Write-Host "-- files --"
foreach ($p in @(
  "Keep-KabuConsoleSession.ps1",
  "Recover-KabuApiIfNeeded.ps1",
  "Disconnect-Rdp-KeepDesktop.ps1",
  "Disconnect-Rdp-KeepDesktop.bat",
  "run-preflight.cmd",
  "run-market-tick.cmd",
  "run-sync.cmd",
  "run-trade.cmd",
  "Sync-Now.cmd"
)) {
  Write-Host ("FILE " + $p + "=" + (Test-Path (Join-Path $SetupDir $p)))
}

Write-Host "-- bridge --"
Write-Host ("BRIDGE_PKG=" + (Test-Path (Join-Path $BridgeRoot "package.json")))
Write-Host ("WAIT_READY=" + (Test-Path (Join-Path $BridgeRoot "src\wait-ready.mjs")))
$envPath = Join-Path $BridgeRoot ".env"
if (Test-Path $envPath) {
  $envText = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
  Write-Host ("LIVE_ORDERS=" + ($envText -match "(?m)^KABU_ALLOW_LIVE_ORDERS=1\s*$"))
  Write-Host ("HAS_TRADE_PASSWORD=" + ($envText -match "(?m)^KABU_TRADE_PASSWORD=.+"))
  Write-Host ("HAS_API_PASSWORD=" + ($envText -match "(?m)^KABU_API_PASSWORD=.+"))
} else {
  Write-Host "LIVE_ORDERS=NO_ENV"
}

Write-Host "-- log tails --"
foreach ($log in @(
  "console-keepalive.log",
  "api-recover.log",
  "sync.log",
  "trade.log",
  "market-tick.log",
  "health.log"
)) {
  $lp = Join-Path $SetupDir $log
  if (Test-Path $lp) {
    Write-Host ("LOG " + $log)
    Get-Content $lp -Tail 5 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ("  " + $_) }
  } else {
    Write-Host ("LOG " + $log + "=missing")
  }
}

Write-Host "-- keepalive selftest --"
$keep = Join-Path $SetupDir "Keep-KabuConsoleSession.ps1"
if (Test-Path $keep) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $keep -SelfTest
  Write-Host ("KEEP_SELFTEST_EXIT=" + $LASTEXITCODE)
}

Write-Host "VERIFY_KABU_OPS_OK"
