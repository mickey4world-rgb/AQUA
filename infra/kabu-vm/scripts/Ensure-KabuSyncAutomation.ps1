#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure kabu-bridge sync/trade batch files + Scheduled Tasks exist (aquaadmin).

  Reliability (sync died mid-session / UI lied "市場外"):
  - wait-ready after logon (OTP)
  - Daily 07:05 + every 5 min for ~9h (was 15 min — too sparse after lunch)
  - Explicit lunch reopen at 12:32 (after 11:30-12:30 break)
  - Parallel + short ExecutionTimeLimit (hung job must not block forever)
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  [string]$TargetUser = "aquaadmin",
  [int]$LogonDelaySeconds = 180,
  [int]$IntervalMinutes = 5,
  [string]$DailyStartTime = "07:05",
  [string]$LunchSyncTime = "12:32"
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

function Reg-Task {
  param(
    [string]$Name,
    [string]$Cmd,
    [bool]$Logon,
    [bool]$DailyRepeat,
    [int]$EveryMin,
    [int]$TimeLimitMinutes = 20,
    [string[]]$ExtraDailyAts = @()
  )
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ("/c `"" + $Cmd + "`"")
  $triggers = @()
  if ($Logon) {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $TargetUser
  }
  if ($DailyRepeat -and $EveryMin -gt 0) {
    $daily = New-ScheduledTaskTrigger -Daily -At $DailyStartTime
    $rep = (New-ScheduledTaskTrigger -Once -At $DailyStartTime `
        -RepetitionInterval (New-TimeSpan -Minutes $EveryMin) `
        -RepetitionDuration (New-TimeSpan -Hours 9)).Repetition
    $daily.Repetition = $rep
    $triggers += $daily
  }
  foreach ($at in $ExtraDailyAts) {
    if ($at -and $at.Trim().Length -gt 0) {
      $triggers += New-ScheduledTaskTrigger -Daily -At $at
    }
  }
  $principal = New-ScheduledTaskPrincipal -UserId $TargetUser -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances Parallel `
    -ExecutionTimeLimit (New-TimeSpan -Minutes $TimeLimitMinutes)
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $triggers `
    -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host ("TASK_OK " + $Name)
}

# SYSTEM + RemoteDisconnect: X close must not depend on Interactive tasks inside a frozen Disc session.
function Reg-SystemConsoleKeepalive {
  param(
    [string]$Name,
    [string]$Cmd
  )
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  $cmdAttr = $Cmd.Replace("&", "&amp;").Replace('"', "&quot;").Replace("<", "&lt;").Replace(">", "&gt;")
  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>SYSTEM: Disc/切断 RDP -&gt; console so kabu sync survives Windows App X close</Description>
  </RegistrationInfo>
  <Triggers>
    <SessionStateChangeTrigger>
      <Enabled>true</Enabled>
      <StateChange>RemoteDisconnect</StateChange>
    </SessionStateChangeTrigger>
    <SessionStateChangeTrigger>
      <Enabled>true</Enabled>
      <StateChange>ConsoleDisconnect</StateChange>
    </SessionStateChangeTrigger>
    <CalendarTrigger>
      <Repetition>
        <Interval>PT1M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2024-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT2M</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c "$cmdAttr"</Arguments>
    </Exec>
  </Actions>
</Task>
"@
  Register-ScheduledTask -TaskName $Name -Xml $xml -Force | Out-Null
  Write-Host ("TASK_OK_SYSTEM " + $Name + " RemoteDisconnect+PT1M")
}


# Preflight: keep console session alive + recover half-dead API before sync/trade
Write-Cmd (Join-Path $SetupDir "run-preflight.cmd") @(
  "@echo off",
  ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $SetupDir "Keep-KabuConsoleSession.ps1") + "`" -SetupDir `"" + $SetupDir + "`""),
  ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $SetupDir "Recover-KabuApiIfNeeded.ps1") + "`" -BridgeRoot `"" + $BridgeRoot + "`" -SetupDir `"" + $SetupDir + "`"")
)

Write-Cmd (Join-Path $SetupDir "run-sync.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run health >> `"" + $SetupDir + "\health.log`" 2>&1"),
  ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-trade.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)
# Lunch reopen: wait-ready briefly then sync+trade (station often half-dead after break)
$lunchLog = Join-Path $SetupDir "lunch-reopen.log"
Write-Cmd (Join-Path $SetupDir "run-lunch-reopen.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("echo ===== LUNCH REOPEN =====>> `"" + $lunchLog + "`""),
  ("set KABU_WAIT_READY_MINUTES=3"),
  ("`"" + $npmCmd + "`" run wait-ready >> `"" + $lunchLog + "`" 2>&1"),
  ("`"" + $npmCmd + "`" run health >> `"" + $lunchLog + "`" 2>&1"),
  ("`"" + $npmCmd + "`" run sync >> `"" + $lunchLog + "`" 2>&1"),
  ("`"" + $npmCmd + "`" run trade >> `"" + $lunchLog + "`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-sync-after-logon.cmd") @(
  "@echo off",
  ("timeout /t " + $LogonDelaySeconds + " /nobreak >nul"),
  ("cd /d " + $BridgeRoot),
  ("set KABU_WAIT_READY_MINUTES=90"),
  ("`"" + $npmCmd + "`" run wait-ready >> `"" + $SetupDir + "\wait-ready.log`" 2>&1"),
  ("if errorlevel 1 exit /b 1"),
  ("`"" + $npmCmd + "`" run probe >> `"" + $SetupDir + "\probe.log`" 2>&1"),
  ("`"" + $npmCmd + "`" run health >> `"" + $SetupDir + "\health.log`" 2>&1"),
  ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-trade-after-logon.cmd") @(
  "@echo off",
  ("timeout /t " + ($LogonDelaySeconds + 60) + " /nobreak >nul"),
  ("cd /d " + $BridgeRoot),
  ("set KABU_WAIT_READY_MINUTES=90"),
  ("`"" + $npmCmd + "`" run wait-ready >> `"" + $SetupDir + "\wait-ready.log`" 2>&1"),
  ("if errorlevel 1 exit /b 1"),
  ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)

Write-Cmd (Join-Path $SetupDir "Sync-Now.cmd") @(
  '@echo off',
  'setlocal',
  ('set BRIDGE=' + $BridgeRoot),
  ('set SETUP=' + $SetupDir),
  'set LOG=%SETUP%\manual-sync.log',
  'echo ===== %DATE% %TIME% Sync-Now =====>> "%LOG%"',
  ('call "' + (Join-Path $SetupDir "run-preflight.cmd") + '" >> "%LOG%" 2>&1'),
  'cd /d "%BRIDGE%"',
  'set KABU_WAIT_READY_MINUTES=5',
  ('call "' + $npmCmd + '" run wait-ready >> "%LOG%" 2>&1'),
  'if errorlevel 1 (',
  '  echo WAIT_READY_FAILED - restart kabuStation if GUI green but API stuck>> "%LOG%"',
  '  echo WAIT_READY_FAILED. Restart kabuStation if GUI is green but API stuck.',
  '  type "%LOG%" | more',
  '  exit /b 1',
  ')',
  ('call "' + $npmCmd + '" run probe >> "%LOG%" 2>&1'),
  ('call "' + $npmCmd + '" run health >> "%LOG%" 2>&1'),
  ('call "' + $npmCmd + '" run sync >> "%LOG%" 2>&1'),
  ('if /I "%~1"=="trade" call "' + $npmCmd + '" run trade >> "%LOG%" 2>&1'),
  'echo done. see %LOG%',
  'type "%LOG%" | more'
)

# Copy recover helpers next to cmds (Update-BridgeOnVm also copies from repo)
foreach ($helper in @(
  "Keep-KabuConsoleSession.ps1",
  "Recover-KabuApiIfNeeded.ps1",
  "Disconnect-Rdp-KeepDesktop.ps1"
)) {
  $srcHelper = Join-Path $PSScriptRoot $helper
  $dstHelper = Join-Path $SetupDir $helper
  if ((Test-Path -LiteralPath $srcHelper) -and ($srcHelper -ne $dstHelper)) {
    Copy-Item $srcHelper $dstHelper -Force
  }
}

$keepPs1 = Join-Path $SetupDir "Keep-KabuConsoleSession.ps1"
if (Test-Path -LiteralPath $keepPs1) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $keepPs1 -SelfTest
  if ($LASTEXITCODE -ne 0) { throw "Keep-KabuConsoleSession -SelfTest failed" }
  Write-Host "KEEP_SELFTEST_OK"
}


Reg-Task -Name "kabu-bridge-sync" -Cmd (Join-Path $SetupDir "run-sync.cmd") `
  -Logon $false -DailyRepeat $true -EveryMin $IntervalMinutes -TimeLimitMinutes 12
Reg-Task -Name "kabu-bridge-trade" -Cmd (Join-Path $SetupDir "run-trade.cmd") `
  -Logon $false -DailyRepeat $true -EveryMin $IntervalMinutes -TimeLimitMinutes 12
Reg-Task -Name "kabu-bridge-lunch-reopen" -Cmd (Join-Path $SetupDir "run-lunch-reopen.cmd") `
  -Logon $false -DailyRepeat $false -EveryMin 0 -TimeLimitMinutes 15 `
  -ExtraDailyAts @($LunchSyncTime)
Write-Cmd (Join-Path $SetupDir "run-console-keepalive.cmd") @(
  "@echo off",
  ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $SetupDir "Keep-KabuConsoleSession.ps1") + "`" -Mode RecoverDisc -SetupDir `"" + $SetupDir + "`" -TargetUser `"" + $TargetUser + "`"")
)
# SYSTEM every 1 min + on RemoteDisconnect — X close must auto-recover without the Disconnect bat
Reg-SystemConsoleKeepalive -Name "kabu-bridge-console-keepalive" `
  -Cmd (Join-Path $SetupDir "run-console-keepalive.cmd")
Reg-Task -Name "kabu-bridge-logon-sync" -Cmd (Join-Path $SetupDir "run-sync-after-logon.cmd") `
  -Logon $true -DailyRepeat $false -EveryMin 0 -TimeLimitMinutes 120
Reg-Task -Name "kabu-bridge-logon-trade" -Cmd (Join-Path $SetupDir "run-trade-after-logon.cmd") `
  -Logon $true -DailyRepeat $false -EveryMin 0 -TimeLimitMinutes 120

Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  $i = $_ | Get-ScheduledTaskInfo
  Write-Host ("TASK " + $_.TaskName + " " + $_.State + " last=" + $i.LastRunTime)
}
Write-Host "ENSURE_SYNC_AUTOMATION_OK dailyStart=$DailyStartTime interval=${IntervalMinutes}m lunch=$LunchSyncTime"
