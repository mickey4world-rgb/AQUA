#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure kabu-bridge sync/trade batch files + Scheduled Tasks exist (aquaadmin).
  Also copies Sync-Now.cmd for manual runs.
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  [string]$TargetUser = "aquaadmin",
  [int]$LogonDelaySeconds = 180,
  [int]$IntervalMinutes = 15
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $SetupDir | Out-Null

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npm) {
  $npmCmd = $npm.Source
} else {
  $npmCmd = @(
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files (x86)\nodejs\npm.cmd"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $npmCmd) { throw "npm.cmd not found" }
if (-not (Test-Path (Join-Path $BridgeRoot "package.json"))) {
  throw "Bridge not found at $BridgeRoot"
}

function Write-Cmd([string]$Path, [string[]]$Lines) {
  Set-Content -Path $Path -Value $Lines -Encoding ASCII
}

function Reg-Task([string]$Name, [string]$Cmd, [bool]$Logon, [int]$EveryMin) {
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ("/c `"" + $Cmd + "`"")
  $triggers = @()
  if ($Logon) {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $TargetUser
  }
  if ($EveryMin -gt 0) {
    $triggers += New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(2) `
      -RepetitionInterval (New-TimeSpan -Minutes $EveryMin) `
      -RepetitionDuration (New-TimeSpan -Days 3650)
  }
  $principal = New-ScheduledTaskPrincipal -UserId $TargetUser -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $triggers `
    -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host ("TASK_OK " + $Name)
}

Write-Cmd (Join-Path $SetupDir "run-sync.cmd") @(
  "@echo off",
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run health >> `"" + $SetupDir + "\health.log`" 2>&1"),
  ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-trade.cmd") @(
  "@echo off",
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-sync-after-logon.cmd") @(
  "@echo off",
  ("timeout /t " + $LogonDelaySeconds + " /nobreak >nul"),
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run probe >> `"" + $SetupDir + "\probe.log`" 2>&1"),
  ("`"" + $npmCmd + "`" run health >> `"" + $SetupDir + "\health.log`" 2>&1"),
  ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-trade-after-logon.cmd") @(
  "@echo off",
  ("timeout /t " + ($LogonDelaySeconds + 60) + " /nobreak >nul"),
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)

# Manual helper (double-clickable)
Write-Cmd (Join-Path $SetupDir "Sync-Now.cmd") @(
  "@echo off",
  "setlocal",
  ("set BRIDGE=" + $BridgeRoot),
  ("set SETUP=" + $SetupDir),
  "set LOG=%SETUP%\manual-sync.log",
  "echo ===== %DATE% %TIME% Sync-Now =====>> \"%LOG%\"",
  "cd /d \"%BRIDGE%\"",
  ("call `"" + $npmCmd + "`" run probe >> \"%LOG%\" 2>&1"),
  ("call `"" + $npmCmd + "`" run health >> \"%LOG%\" 2>&1"),
  ("call `"" + $npmCmd + "`" run sync >> \"%LOG%\" 2>&1"),
  "if /I \"%~1\"==\"trade\" call `"" + $npmCmd + "`" run trade >> \"%LOG%\" 2>&1",
  "echo done. see %LOG%",
  "type \"%LOG%\" | more"
)

Reg-Task "kabu-bridge-sync" (Join-Path $SetupDir "run-sync.cmd") $false $IntervalMinutes
Reg-Task "kabu-bridge-trade" (Join-Path $SetupDir "run-trade.cmd") $false $IntervalMinutes
Reg-Task "kabu-bridge-logon-sync" (Join-Path $SetupDir "run-sync-after-logon.cmd") $true 0
Reg-Task "kabu-bridge-logon-trade" (Join-Path $SetupDir "run-trade-after-logon.cmd") $true 0

Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  $i = $_ | Get-ScheduledTaskInfo
  Write-Host ("TASK " + $_.TaskName + " " + $_.State + " last=" + $i.LastRunTime)
}
Write-Host "ENSURE_SYNC_AUTOMATION_OK"
