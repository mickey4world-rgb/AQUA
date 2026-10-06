#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure kabu-bridge sync/trade batch files + Scheduled Tasks exist (aquaadmin).
  Also copies Sync-Now.cmd for manual runs.

  改善点（朝緑でも sync できない問題）:
  - ログオン後は wait-ready（OTP/緑まで最大90分リトライ）してから sync
  - 定期タスクは 07:05 起点の Daily + 15分繰り返し（VM 07:00 起動・OTP 直後に合わせる）
  - ExecutionTimeLimit 短縮 + Parallel（ハング1本で IgnoreNew 全滅を防ぐ）
  - fetch タイムアウトは bridge 側 kabu.mjs でも実施
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  [string]$TargetUser = "aquaadmin",
  [int]$LogonDelaySeconds = 180,
  [int]$IntervalMinutes = 15,
  [string]$DailyStartTime = "07:05"
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
    [int]$TimeLimitMinutes = 20
  )
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ("/c `"" + $Cmd + "`"")
  $triggers = @()
  if ($Logon) {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $TargetUser
  }
  if ($DailyRepeat -and $EveryMin -gt 0) {
    # 深夜 Once@00:02 は deallocate 明けに取りこぼしやすい → 朝 Daily 起点
    $daily = New-ScheduledTaskTrigger -Daily -At $DailyStartTime
    $rep = (New-ScheduledTaskTrigger -Once -At $DailyStartTime `
        -RepetitionInterval (New-TimeSpan -Minutes $EveryMin) `
        -RepetitionDuration (New-TimeSpan -Hours 9)).Repetition
    $daily.Repetition = $rep
    $triggers += $daily
  }
  $principal = New-ScheduledTaskPrincipal -UserId $TargetUser -LogonType Interactive -RunLevel Highest
  # Parallel: ハングした1本が IgnoreNew で後続を殺さない。短いタイムアウトで回収。
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances Parallel `
    -ExecutionTimeLimit (New-TimeSpan -Minutes $TimeLimitMinutes)
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
# ログオン後: OTP待ち（最大90分）→ 成功したら即 sync。朝の緑マーク後に橋渡しする本丸。
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

# Manual helper (double-clickable) — OTP直後はこれを叩く
Write-Cmd (Join-Path $SetupDir "Sync-Now.cmd") @(
  "@echo off",
  "setlocal",
  ("set BRIDGE=" + $BridgeRoot),
  ("set SETUP=" + $SetupDir),
  "set LOG=%SETUP%\manual-sync.log",
  "echo ===== %DATE% %TIME% Sync-Now =====>> \"%LOG%\"",
  "cd /d \"%BRIDGE%\"",
  "set KABU_WAIT_READY_MINUTES=5",
  ("call `"" + $npmCmd + "`" run wait-ready >> \"%LOG%\" 2>&1"),
  "if errorlevel 1 (",
  "  echo WAIT_READY_FAILED — GUI緑でもダメなら株ステーション再起動後に再実行>> \"%LOG%\"",
  "  echo WAIT_READY_FAILED. Restart kabuStation if GUI is green but API stuck.",
  "  type \"%LOG%\" | more",
  "  exit /b 1",
  ")",
  ("call `"" + $npmCmd + "`" run probe >> \"%LOG%\" 2>&1"),
  ("call `"" + $npmCmd + "`" run health >> \"%LOG%\" 2>&1"),
  ("call `"" + $npmCmd + "`" run sync >> \"%LOG%\" 2>&1"),
  "if /I \"%~1\"==\"trade\" call `"" + $npmCmd + "`" run trade >> \"%LOG%\" 2>&1",
  "echo done. see %LOG%",
  "type \"%LOG%\" | more"
)

Reg-Task -Name "kabu-bridge-sync" -Cmd (Join-Path $SetupDir "run-sync.cmd") `
  -Logon $false -DailyRepeat $true -EveryMin $IntervalMinutes -TimeLimitMinutes 15
Reg-Task -Name "kabu-bridge-trade" -Cmd (Join-Path $SetupDir "run-trade.cmd") `
  -Logon $false -DailyRepeat $true -EveryMin $IntervalMinutes -TimeLimitMinutes 15
# wait-ready 最大90分 + sync → タイムリミット 120分
Reg-Task -Name "kabu-bridge-logon-sync" -Cmd (Join-Path $SetupDir "run-sync-after-logon.cmd") `
  -Logon $true -DailyRepeat $false -EveryMin 0 -TimeLimitMinutes 120
Reg-Task -Name "kabu-bridge-logon-trade" -Cmd (Join-Path $SetupDir "run-trade-after-logon.cmd") `
  -Logon $true -DailyRepeat $false -EveryMin 0 -TimeLimitMinutes 120

Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  $i = $_ | Get-ScheduledTaskInfo
  Write-Host ("TASK " + $_.TaskName + " " + $_.State + " last=" + $i.LastRunTime)
}
Write-Host "ENSURE_SYNC_AUTOMATION_OK dailyStart=$DailyStartTime interval=${IntervalMinutes}m"
