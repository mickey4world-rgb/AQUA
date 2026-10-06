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

# バッチ／定期タスクの正は Ensure-KabuSyncAutomation.ps1（wait-ready・Daily 06:45）
$ensure = Join-Path $PSScriptRoot "Ensure-KabuSyncAutomation.ps1"
if (-not (Test-Path -LiteralPath $ensure)) {
  $ensure = Join-Path $SetupDir "Ensure-KabuSyncAutomation.ps1"
}
if (Test-Path -LiteralPath $ensure) {
  & $ensure -BridgeRoot $BridgeRoot -SetupDir $SetupDir `
    -LogonDelaySeconds $BridgeDelaySeconds -IntervalMinutes $IntervalMinutes
} else {
  Write-Warning "Ensure-KabuSyncAutomation.ps1 not found — writing legacy cmds only"
  $syncCmd = Join-Path $SetupDir "run-sync.cmd"
  Write-CmdFile $syncCmd @(
    "@echo off",
    ("cd /d " + $BridgeRoot),
    ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
  )
  Register-SimpleTask -TaskName "kabu-bridge-sync" -CmdPath $syncCmd -EveryMin $IntervalMinutes
}

Write-Host "AUTOSTART_OK"
