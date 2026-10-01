#Requires -Version 5.1
<#
.SYNOPSIS
  ログオン後に kabuステーション／kabu-bridge を自動起動する。
  - スタートアップ: kabu ショートカット（任意パス）
  - タスクスケジューラ: bridge sync / trade（ログオン後遅延 + 定期）

.NOTES
  管理者で実行。API パスワードは .env のみ。AutoLogon は別スクリプト。
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  # 既定の一般的なインストール先。無ければ手動で -KabuExe を指定
  [string]$KabuExe = "",
  [int]$BridgeDelaySeconds = 180,
  [int]$IntervalMinutes = 15
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

New-Item -ItemType Directory -Force -Path $SetupDir | Out-Null

# --- Resolve kabu exe ---
$candidates = @(
  $KabuExe,
  "${env:ProgramFiles}\kabuステーション\kabuステーション.exe",
  "${env:ProgramFiles(x86)}\kabuステーション\kabuステーション.exe",
  "${env:LOCALAPPDATA}\kabuステーション\kabuステーション.exe",
  "C:\Program Files\kabuStation\kabuStation.exe"
) | Where-Object { $_ -and $_.Trim() -ne "" }

$resolvedKabu = $null
foreach ($c in $candidates) {
  if (Test-Path $c) { $resolvedKabu = $c; break }
}

$startup = [Environment]::GetFolderPath("Startup")
Write-Host "==> Startup folder: $startup"

if ($resolvedKabu) {
  $lnkPath = Join-Path $startup "kabuStation.lnk"
  Write-Host "==> Create shortcut -> $resolvedKabu"
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($lnkPath)
  $lnk.TargetPath = $resolvedKabu
  $lnk.WorkingDirectory = Split-Path $resolvedKabu -Parent
  $lnk.WindowStyle = 1
  $lnk.Save()
} else {
  Write-Warning @"
kabu exe not found. After install, re-run with:
  .\Configure-KabuAutostart.ps1 -KabuExe 'C:\full\path\to\kabu.exe'
Or manually place a shortcut in: $startup
"@
}

if (-not (Test-Path (Join-Path $BridgeRoot "package.json"))) {
  Write-Warning "Bridge not found at $BridgeRoot — skip scheduled tasks."
  return
}

$nodejsCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodejsCmd) {
  Write-Warning "node.exe not in PATH — skip bridge tasks."
  return
}
$nodejs = $nodejsCmd.Source

$npmCmdObj = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmdObj) {
  $npmCmd = $npmCmdObj.Source
} else {
  $npmCmd = Join-Path (Split-Path $nodejs -Parent) "npm.cmd"
}
if (-not (Test-Path $npmCmd)) {
  Write-Warning "npm.cmd not found — skip bridge tasks."
  return
}

function Register-BridgeTask {
  param(
    [string]$TaskName,
    [string]$NpmScript,
    [int]$DelaySec,
    [int]$EveryMin
  )
  $wrapper = Join-Path $SetupDir "run-$NpmScript.cmd"
  @"
@echo off
cd /d "$BridgeRoot"
"$npmCmd" run $NpmScript >> "$SetupDir\$NpmScript.log" 2>&1
"@ | Set-Content -Path $wrapper -Encoding ASCII

  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

  $action = New-ScheduledTaskAction -Execute $wrapper
  $triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1) `
      -RepetitionInterval (New-TimeSpan -Minutes $EveryMin) `
      -RepetitionDuration (New-TimeSpan -Days 3650))
  )
  # Delay only applies to logon trigger via XML; set simple random delay on first
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)

  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Principal $principal -Settings $settings -Force | Out-Null

  # Soft delay file for logon: wait then run (avoids racing kabu cold start)
  if ($DelaySec -gt 0 -and $NpmScript -eq "sync") {
    $delayWrapper = Join-Path $SetupDir "run-sync-after-logon.cmd"
    @"
@echo off
timeout /t $DelaySec /nobreak >nul
cd /d "$BridgeRoot"
"$npmCmd" run probe >> "$SetupDir\probe.log" 2>&1
"$npmCmd" run sync >> "$SetupDir\sync.log" 2>&1
"@ | Set-Content -Path $delayWrapper -Encoding ASCII
    $delayName = "kabu-bridge-logon-sync"
    Unregister-ScheduledTask -TaskName $delayName -Confirm:$false -ErrorAction SilentlyContinue
    $a2 = New-ScheduledTaskAction -Execute $delayWrapper
    $t2 = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    Register-ScheduledTask -TaskName $delayName -Action $a2 -Trigger $t2 `
      -Principal $principal -Settings $settings -Force | Out-Null
  }

  Write-Host "==> Scheduled task: $TaskName ($NpmScript every ${EveryMin}m + at logon)"
}

Register-BridgeTask -TaskName "kabu-bridge-sync" -NpmScript "sync" -DelaySec $BridgeDelaySeconds -EveryMin $IntervalMinutes
Register-BridgeTask -TaskName "kabu-bridge-trade" -NpmScript "trade" -DelaySec ($BridgeDelaySeconds + 60) -EveryMin $IntervalMinutes

# trade logon delay wrapper
$tradeDelay = Join-Path $SetupDir "run-trade-after-logon.cmd"
@"
@echo off
timeout /t $($BridgeDelaySeconds + 60) /nobreak >nul
cd /d "$BridgeRoot"
"$npmCmd" run trade >> "$SetupDir\trade.log" 2>&1
"@ | Set-Content -Path $tradeDelay -Encoding ASCII
$tradeLogon = "kabu-bridge-logon-trade"
Unregister-ScheduledTask -TaskName $tradeLogon -Confirm:$false -ErrorAction SilentlyContinue
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $tradeLogon `
  -Action (New-ScheduledTaskAction -Execute $tradeDelay) `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) `
  -Principal $principal -Settings $settings -Force | Out-Null

Write-Host @"

==> Autostart configured
- kabu shortcut (if exe found): $startup
- Tasks: kabu-bridge-sync / kabu-bridge-trade (every ${IntervalMinutes}m)
- Logon delayed: kabu-bridge-logon-sync (${BridgeDelaySeconds}s), kabu-bridge-logon-trade (+60s)
- Logs: $SetupDir\*.log

CHECK
1. Configure-KabuSessionKeepAlive.ps1 済みか
2. Enable-KabuAutoLogon.ps1 で再起動後デスクトップまで来るか
3. kabu API アイコン緑のあと probe → sync → trade
4. RDP 切断は Disconnect-Rdp-KeepDesktop.bat のみ
"@
