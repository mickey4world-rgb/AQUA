#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure kabu-bridge sync/trade batch files + Scheduled Tasks exist (aquaadmin).

  Reliability (sync died mid-session / UI lied "outside market"):
  - wait-ready after logon (OTP)
  - Daily 07:00 JST + every 5 min for ~10h (covers 15:30 close)
  - Explicit lunch reopen at 12:32 (after 11:30-12:30 break)
  - SYSTEM market-tick (Interactive-only died after Disconnect / Disc)
  - Parallel + short ExecutionTimeLimit (hung job must not block forever)
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  [string]$TargetUser = "aquaadmin",
  [int]$LogonDelaySeconds = 180,
  [int]$IntervalMinutes = 5,
  [string]$DailyStartTime = "07:00",
  [string]$LunchSyncTime = "12:32"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $SetupDir | Out-Null

# VM image defaults to UTC; Daily 07:00 would fire at 16:00 JST. Force Tokyo first.
& tzutil.exe /s "Tokyo Standard Time"
if ($LASTEXITCODE -ne 0) {
  Write-Host ("TZ_SET_FAIL exit=" + $LASTEXITCODE)
} else {
  Write-Host ("TZ_SET " + [TimeZoneInfo]::Local.Id + " now=" + (Get-Date).ToString("o"))
}

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
    <Description>SYSTEM: Disc/disconnect RDP -&gt; console so kabu sync survives Windows App X close</Description>
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

# SYSTEM market-tick: does not depend on Interactive session after 04 Disconnect / RDP X.
# kabuStation API is localhost; once OTP session is console-alive, SYSTEM can sync/trade.
function Reg-SystemMarketTick {
  param(
    [string]$Name,
    [string]$Cmd,
    [string]$StartAt = "07:00",
    [int]$EveryMin = 5,
    [string]$Duration = "PT10H",
    [string[]]$ExtraDailyAts = @()
  )
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  $cmdAttr = $Cmd.Replace("&", "&amp;").Replace('"', "&quot;").Replace("<", "&lt;").Replace(">", "&gt;")
  # Avoid `$at:00` scope parse (PowerShell treats `at:00` as a drive-qualified variable)
  # Explicit +09:00 so schedule stays JST even if someone flips VM TZ back to UTC
  $startBoundary = "2024-01-01T{0}:00+09:00" -f $StartAt
  $extraTriggers = ""
  foreach ($at in $ExtraDailyAts) {
    if (-not $at -or $at.Trim().Length -eq 0) { continue }
    $extraBoundary = "2024-01-01T{0}:00+09:00" -f $at.Trim()
    $extraTriggers += @"
    <CalendarTrigger>
      <StartBoundary>$extraBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
"@
  }
  $interval = ("PT{0}M" -f $EveryMin)
  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>SYSTEM market-tick sync then trade; survives Disconnect / Disc (TSE to 15:30)</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <Repetition>
        <Interval>$interval</Interval>
        <Duration>$Duration</Duration>
        <StopAtDurationEnd>true</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>$startBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
$extraTriggers
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
    <ExecutionTimeLimit>PT15M</ExecutionTimeLimit>
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
  Write-Host ("TASK_OK_SYSTEM " + $Name + " PT${EveryMin}M@$StartAt+$Duration")
}


# Preflight: keep console session alive + recover half-dead API before sync/trade
Write-Cmd (Join-Path $SetupDir "run-preflight.cmd") @(
  "@echo off",
  ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $SetupDir "Keep-KabuConsoleSession.ps1") + "`" -SetupDir `"" + $SetupDir + "`""),
  ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $SetupDir "Recover-KabuApiIfNeeded.ps1") + "`" -BridgeRoot `"" + $BridgeRoot + "`" -SetupDir `"" + $SetupDir + "`""),
  ("cd /d " + $BridgeRoot),
  ("call `"" + $npmCmd + "`" run assert-order-shape >> `"" + $SetupDir + "\trade-shape.log`" 2>&1"),
  ("if errorlevel 1 ("),
  ("  echo TRADE_SHAPE_BAD>> `"" + $SetupDir + "\trade-shape.log`""),
  ("  exit /b 1"),
  (")")
)

# CRITICAL: npm.cmd must be invoked with `call`. Without it, cmd.exe never returns
# after the first npm and market-tick stops at health. Sync-Now worked only because it used call.
Write-Cmd (Join-Path $SetupDir "run-sync.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("call `"" + $npmCmd + "`" run health >> `"" + $SetupDir + "\health.log`" 2>&1"),
  ("call `"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-trade.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("call `"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)
# Atomic tick: sync then trade so LIVE never runs on a silently dead station
$tickLog = Join-Path $SetupDir "market-tick.log"
Write-Cmd (Join-Path $SetupDir "run-market-tick.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("echo ===== MARKET TICK %DATE% %TIME% =====>> `"" + $tickLog + "`""),
  ("call `"" + $npmCmd + "`" run health >> `"" + $tickLog + "`" 2>&1"),
  ("call `"" + $npmCmd + "`" run sync >> `"" + $tickLog + "`" 2>&1"),
  ("if errorlevel 1 ("),
  ("  echo SYNC_FAIL skip trade>> `"" + $tickLog + "`""),
  ("  exit /b 1"),
  (")"),
  ("echo %DATE% %TIME%> `"" + (Join-Path $SetupDir "last-aqua-sync.ok") + "`""),
  ("echo SYNC_OK>> `"" + $tickLog + "`""),
  ("call `"" + $npmCmd + "`" run trade >> `"" + $tickLog + "`" 2>&1"),
  ("echo TRADE_DONE>> `"" + $tickLog + "`""),
  ("exit /b 0")
)
# Lunch reopen: wait-ready briefly then sync+trade (station often half-dead after break)
$lunchLog = Join-Path $SetupDir "lunch-reopen.log"
Write-Cmd (Join-Path $SetupDir "run-lunch-reopen.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("echo ===== LUNCH REOPEN =====>> `"" + $lunchLog + "`""),
  ("set KABU_WAIT_READY_MINUTES=3"),
  ("call `"" + $npmCmd + "`" run wait-ready >> `"" + $lunchLog + "`" 2>&1"),
  ("call `"" + $npmCmd + "`" run health >> `"" + $lunchLog + "`" 2>&1"),
  ("call `"" + $npmCmd + "`" run sync >> `"" + $lunchLog + "`" 2>&1"),
  ("call `"" + $npmCmd + "`" run trade >> `"" + $lunchLog + "`" 2>&1")
)
# After AutoLogon: wait for OTP window, then same path as Sync-Now (preflight required).
# Old version skipped preflight => Disc/half-dead API never healed; Sync-Now worked, this did not.
Write-Cmd (Join-Path $SetupDir "run-sync-after-logon.cmd") @(
  "@echo off",
  ("timeout /t " + $LogonDelaySeconds + " /nobreak >nul"),
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("set KABU_WAIT_READY_MINUTES=90"),
  ("call `"" + $npmCmd + "`" run wait-ready >> `"" + $SetupDir + "\wait-ready.log`" 2>&1"),
  ("if errorlevel 1 exit /b 1"),
  ("call `"" + $npmCmd + "`" run probe >> `"" + $SetupDir + "\probe.log`" 2>&1"),
  ("call `"" + $npmCmd + "`" run health >> `"" + $SetupDir + "\health.log`" 2>&1"),
  ("call `"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1"),
  ("if errorlevel 1 exit /b 1"),
  ("call `"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)
Write-Cmd (Join-Path $SetupDir "run-trade-after-logon.cmd") @(
  "@echo off",
  ("timeout /t " + ($LogonDelaySeconds + 60) + " /nobreak >nul"),
  ("call `"" + (Join-Path $SetupDir "run-preflight.cmd") + "`""),
  ("cd /d " + $BridgeRoot),
  ("set KABU_WAIT_READY_MINUTES=90"),
  ("call `"" + $npmCmd + "`" run wait-ready >> `"" + $SetupDir + "\wait-ready.log`" 2>&1"),
  ("if errorlevel 1 exit /b 1"),
  ("call `"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1"),
  ("if errorlevel 1 exit /b 1"),
  ("call `"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)

# Never pipe to `more` - it waits for Space and looks like automation is hung.
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
  '  echo --- last log lines ---',
  '  powershell.exe -NoProfile -Command "Get-Content -LiteralPath ''%LOG%'' -Tail 40 -ErrorAction SilentlyContinue"',
  '  echo full log: %LOG%',
  '  exit /b 1',
  ')',
  ('call "' + $npmCmd + '" run probe >> "%LOG%" 2>&1'),
  ('call "' + $npmCmd + '" run health >> "%LOG%" 2>&1'),
  ('call "' + $npmCmd + '" run sync >> "%LOG%" 2>&1'),
  'if errorlevel 1 (',
  '  echo SYNC_FAILED>> "%LOG%"',
  '  echo SYNC_FAILED',
  '  echo --- last log lines ---',
  '  powershell.exe -NoProfile -Command "Get-Content -LiteralPath ''%LOG%'' -Tail 40 -ErrorAction SilentlyContinue"',
  '  echo full log: %LOG%',
  '  exit /b 1',
  ')',
  ('call "' + $npmCmd + '" run trade >> "%LOG%" 2>&1'),
  'echo SYNC_OK done. log=%LOG%',
  'powershell.exe -NoProfile -Command "Get-Content -LiteralPath ''%LOG%'' -Tail 20 -ErrorAction SilentlyContinue"',
  'exit /b 0'
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

# SYSTEM market-tick / recover must read bridge secrets after Disconnect migration
function Grant-SystemBridgeAccess {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  try {
    icacls $Path /grant "*S-1-5-18:(R)" /C | Out-Null
    Write-Host ("ACL_SYSTEM_R " + $Path)
  } catch {
    Write-Host ("ACL_SYSTEM_SKIP " + $Path + " " + $_.Exception.Message)
  }
}
Grant-SystemBridgeAccess -Path $BridgeRoot
Grant-SystemBridgeAccess -Path (Join-Path $BridgeRoot ".env")
Grant-SystemBridgeAccess -Path $SetupDir
# Ensure SYSTEM can traverse + execute npm scripts under bridge
try {
  icacls $BridgeRoot /grant "*S-1-5-18:(OI)(CI)(RX)" /T /C | Out-Null
  Write-Host "ACL_SYSTEM_RX_BRIDGE_OK"
} catch {
  Write-Host ("ACL_SYSTEM_RX_SKIP " + $_.Exception.Message)
}


# Primary path: SYSTEM atomic tick (sync then trade). Interactive-only died after Disconnect.
Reg-SystemMarketTick -Name "kabu-bridge-market-tick" -Cmd (Join-Path $SetupDir "run-market-tick.cmd") `
  -StartAt $DailyStartTime -EveryMin $IntervalMinutes -Duration "PT10H" `
  -ExtraDailyAts @($LunchSyncTime)
# Remove legacy Interactive-only duplicates that raced / silently failed after Disc
Unregister-ScheduledTask -TaskName "kabu-bridge-sync" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "kabu-bridge-trade" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "kabu-bridge-lunch-reopen" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "kabu-bridge-market-tick-user" -Confirm:$false -ErrorAction SilentlyContinue
# Auto-judge loop (SYSTEM): Disc->console then OTP-safe recovery ladder; report to AQUA
Write-Cmd (Join-Path $SetupDir "run-auto-judge.cmd") @(
  "@echo off",
  ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $SetupDir "Keep-KabuConsoleSession.ps1") + "`" -Mode RecoverDisc -SetupDir `"" + $SetupDir + "`" -TargetUser `"" + $TargetUser + "`""),
  ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $SetupDir "Recover-KabuApiIfNeeded.ps1") + "`" -BridgeRoot `"" + $BridgeRoot + "`" -SetupDir `"" + $SetupDir + "`"")
)
# Back-compat name used by older docs
Write-Cmd (Join-Path $SetupDir "run-console-keepalive.cmd") @(
  "@echo off",
  ("call `"" + (Join-Path $SetupDir "run-auto-judge.cmd") + "`"")
)
# SYSTEM every 1 min + on RemoteDisconnect - judgment+recovery without office babysitting
Reg-SystemConsoleKeepalive -Name "kabu-bridge-console-keepalive" `
  -Cmd (Join-Path $SetupDir "run-auto-judge.cmd")
Reg-Task -Name "kabu-bridge-logon-sync" -Cmd (Join-Path $SetupDir "run-sync-after-logon.cmd") `
  -Logon $true -DailyRepeat $false -EveryMin 0 -TimeLimitMinutes 120
Reg-Task -Name "kabu-bridge-logon-trade" -Cmd (Join-Path $SetupDir "run-trade-after-logon.cmd") `
  -Logon $true -DailyRepeat $false -EveryMin 0 -TimeLimitMinutes 120

@(Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue) |
  Where-Object { $_ -and $_.TaskName } |
  ForEach-Object {
    $i = $_ | Get-ScheduledTaskInfo
    Write-Host ("TASK " + $_.TaskName + " " + $_.State + " last=" + $i.LastRunTime + " user=" + $_.Principal.UserId)
  }
$tick = Get-ScheduledTask -TaskName "kabu-bridge-market-tick" -ErrorAction SilentlyContinue
if (-not $tick) { throw "kabu-bridge-market-tick missing after register" }
$tickUser = [string]$tick.Principal.UserId
if ($tickUser -notmatch "SYSTEM|S-1-5-18") {
  throw ("kabu-bridge-market-tick must be SYSTEM, got: " + $tickUser)
}
Write-Host "ENSURE_SYNC_AUTOMATION_OK dailyStart=$DailyStartTime interval=${IntervalMinutes}m lunch=$LunchSyncTime systemTick=OK"
