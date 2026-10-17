#Requires -Version 5.1
# ASCII-only. Azure Run Command oracle for kabu auto-trade ops.
# Usage (from laptop):
#   az vm run-command invoke -g rg-personal-apps-prod -n vm-kabu-aqua --command-id RunPowerShellScript --scripts "@infra/kabu-vm/scripts/Verify-KabuOpsOnVm.ps1"
param(
  [string]$SetupDir = "C:\kabu-setup",
  [string]$BridgeRoot = "C:\kabu-bridge"
)

$ErrorActionPreference = "Continue"
$verifyFailed = $false
Write-Host "=== KABU OPS VERIFY ==="
Write-Host ("TZ=" + [TimeZoneInfo]::Local.Id)
Write-Host ("NOW_LOCAL=" + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("NOW_UTC=" + [DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))
if ([TimeZoneInfo]::Local.Id -notmatch "Tokyo") {
  Write-Host "TZ_BAD expected Tokyo Standard Time (07:00 schedule must be JST)"
  $verifyFailed = $true
}

Write-Host "-- tasks --"
$required = @(
  "kabu-bridge-market-tick",
  "kabu-bridge-console-keepalive",
  "kabu-bridge-logon-sync",
  "kabu-bridge-logon-trade"
)
foreach ($need in $required) {
  $t = Get-ScheduledTask -TaskName $need -ErrorAction SilentlyContinue
  if (-not $t) {
    Write-Host ("TASK_MISSING " + $need)
    $verifyFailed = $true
  } else {
    $prin = ($t.Principal.UserId)
    Write-Host ("TASK_HAVE " + $need + " state=" + $t.State + " user=" + $prin)
    if ($need -eq "kabu-bridge-market-tick" -and ([string]$prin -notmatch "SYSTEM|S-1-5-18")) {
      Write-Host "TASK_BAD_PRINCIPAL market-tick must be SYSTEM"
      $verifyFailed = $true
    }
  }
}
@(Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue) |
  Where-Object { $_ -and $_.TaskName } |
  ForEach-Object {
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

$tickCmd = Join-Path $SetupDir "run-market-tick.cmd"
$syncNow = Join-Path $SetupDir "Sync-Now.cmd"
if (Test-Path $tickCmd) {
  $tickText = Get-Content $tickCmd -Raw
  if ($tickText -notmatch '(?m)^call .*npm\.cmd.*run sync') {
    Write-Host "TICK_CMD_BAD npm sync must use call (otherwise batch exits after health)"
    $verifyFailed = $true
  } else {
    Write-Host "TICK_CMD_CALL_OK"
  }
}
if (Test-Path $syncNow) {
  if (Select-String -Path $syncNow -Pattern "\| more" -Quiet) {
    Write-Host "SYNCNOW_BAD still pipes to more (Space-key hang)"
    $verifyFailed = $true
  } else {
    Write-Host "SYNCNOW_NO_MORE_OK"
  }
}

$recover = Join-Path $SetupDir "Recover-KabuApiIfNeeded.ps1"
if (Test-Path $recover) {
  $recText = Get-Content $recover -Raw
  if ($recText -match "Stop-Process" -or $recText -match "Start-Process\s+-FilePath") {
    Write-Host "RECOVER_BAD must never kill/restart kabuStation (OTP hell)"
    $verifyFailed = $true
  } else {
    Write-Host "RECOVER_NO_KILL_OK"
  }
}

$tradeJs = Join-Path $BridgeRoot "src\trade.mjs"
if (Test-Path $tradeJs) {
  $tradeText = Get-Content $tradeJs -Raw
  if ($tradeText -match 'KABU_FUND_TYPE \?\? "AA"' -or $tradeText -match 'FundType: isSell \? "  " : "AA"') {
    Write-Host "TRADE_FUNDTYPE_BAD default must not be AA (100204)"
    $verifyFailed = $true
  } elseif ($tradeText -match 'KABU_FUND_TYPE \?\? "02"' -or $tradeText -match 'resolveBuyFundType') {
    Write-Host "TRADE_FUNDTYPE_02_OK"
  } else {
    Write-Host "TRADE_FUNDTYPE_UNKNOWN review trade.mjs FundType"
    $verifyFailed = $true
  }
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
  if ($LASTEXITCODE -ne 0) { $verifyFailed = $true }
}

Write-Host "-- SYSTEM ACL / dry-run tick --"
if (Test-Path $envPath) {
  $acl = (icacls $envPath) -join " "
  Write-Host ("ENV_ACL=" + $acl)
  if ($acl -notmatch "SYSTEM|S-1-5-18") {
    Write-Host "ENV_ACL_WARN SYSTEM may not read .env"
  }
}
# Prove the SYSTEM task can start (station may be offline → sync fail is OK; missing task is not)
try {
  Start-ScheduledTask -TaskName "kabu-bridge-market-tick" -ErrorAction Stop
  Start-Sleep -Seconds 8
  $info = Get-ScheduledTaskInfo -TaskName "kabu-bridge-market-tick"
  Write-Host ("TICK_DRYRUN last=" + $info.LastRunTime + " result=" + $info.LastTaskResult + " state=" + (Get-ScheduledTask -TaskName "kabu-bridge-market-tick").State)
} catch {
  Write-Host ("TICK_DRYRUN_FAIL " + $_.Exception.Message)
  $verifyFailed = $true
}

if ($verifyFailed) {
  Write-Host "VERIFY_KABU_OPS_FAIL"
  exit 1
}
Write-Host "VERIFY_KABU_OPS_OK"
