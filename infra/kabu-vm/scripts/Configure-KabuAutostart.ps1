#Requires -Version 5.1
<#
.SYNOPSIS
  After logon: start kabuStation shortcut + schedule kabu-bridge sync/trade.
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
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

$candidates = @(
  $KabuExe,
  "${env:ProgramFiles}\kabuStation\kabuStation.exe",
  "${env:ProgramFiles(x86)}\kabuStation\kabuStation.exe",
  "${env:LOCALAPPDATA}\kabuStation\kabuStation.exe"
) | Where-Object { $_ -and $_.Trim() -ne "" }

$resolvedKabu = $null
foreach ($c in $candidates) {
  if (Test-Path -LiteralPath $c) { $resolvedKabu = $c; break }
}

# Broader search under Program Files
if (-not $resolvedKabu) {
  $hit = Get-ChildItem -Path "$env:ProgramFiles","${env:ProgramFiles(x86)}","$env:LOCALAPPDATA" -Filter "*kabu*.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($hit) { $resolvedKabu = $hit.FullName }
}

$startup = [Environment]::GetFolderPath("Startup")
Write-Host ("Startup folder: " + $startup)

if ($resolvedKabu) {
  $lnkPath = Join-Path $startup "kabuStation.lnk"
  Write-Host ("Create shortcut -> " + $resolvedKabu)
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($lnkPath)
  $lnk.TargetPath = $resolvedKabu
  $lnk.WorkingDirectory = Split-Path $resolvedKabu -Parent
  $lnk.WindowStyle = 1
  $lnk.Save()
} else {
  Write-Warning "kabu exe not found. Place shortcut manually in Startup, or re-run with -KabuExe"
}

if (-not (Test-Path (Join-Path $BridgeRoot "package.json"))) {
  Write-Warning ("Bridge not found at " + $BridgeRoot)
  Write-Host "AUTOSTART_PARTIAL"
  return
}

$nodejsCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodejsCmd) {
  Write-Warning "node.exe not in PATH"
  Write-Host "AUTOSTART_PARTIAL"
  return
}
$npmCmdObj = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmdObj) {
  $npmCmd = $npmCmdObj.Source
} else {
  $npmCmd = Join-Path (Split-Path $nodejsCmd.Source -Parent) "npm.cmd"
}
if (-not (Test-Path -LiteralPath $npmCmd)) {
  Write-Warning "npm.cmd not found"
  Write-Host "AUTOSTART_PARTIAL"
  return
}

function Write-CmdFile([string]$Path, [string[]]$Lines) {
  Set-Content -Path $Path -Value $Lines -Encoding ASCII
}

function Register-SimpleTask {
  param(
    [string]$TaskName,
    [string]$CmdPath,
    [switch]$AtLogon,
    [int]$EveryMin = 0
  )
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ("/c `"" + $CmdPath + "`"")
  $triggers = @()
  if ($AtLogon) {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  }
  if ($EveryMin -gt 0) {
    $triggers += New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(2) `
      -RepetitionInterval (New-TimeSpan -Minutes $EveryMin) `
      -RepetitionDuration (New-TimeSpan -Days 3650)
  }
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host ("TASK_OK " + $TaskName)
}

$syncCmd = Join-Path $SetupDir "run-sync.cmd"
Write-CmdFile $syncCmd @(
  "@echo off",
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
)

$tradeCmd = Join-Path $SetupDir "run-trade.cmd"
Write-CmdFile $tradeCmd @(
  "@echo off",
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)

$logonSync = Join-Path $SetupDir "run-sync-after-logon.cmd"
Write-CmdFile $logonSync @(
  "@echo off",
  ("timeout /t " + $BridgeDelaySeconds + " /nobreak >nul"),
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run probe >> `"" + $SetupDir + "\probe.log`" 2>&1"),
  ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
)

$logonTrade = Join-Path $SetupDir "run-trade-after-logon.cmd"
Write-CmdFile $logonTrade @(
  "@echo off",
  ("timeout /t " + ($BridgeDelaySeconds + 60) + " /nobreak >nul"),
  ("cd /d " + $BridgeRoot),
  ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
)

Register-SimpleTask -TaskName "kabu-bridge-sync" -CmdPath $syncCmd -EveryMin $IntervalMinutes
Register-SimpleTask -TaskName "kabu-bridge-trade" -CmdPath $tradeCmd -EveryMin $IntervalMinutes
Register-SimpleTask -TaskName "kabu-bridge-logon-sync" -CmdPath $logonSync -AtLogon
Register-SimpleTask -TaskName "kabu-bridge-logon-trade" -CmdPath $logonTrade -AtLogon

Write-Host "AUTOSTART_OK"
