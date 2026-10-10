#Requires -Version 5.1
<#
.SYNOPSIS
  Azure VM 上で kabu 無人運用に必要な「セッション維持」を設定する。
  - スクリーンセーバー／画面ロック無効
  - 電源: ディスプレイオフ・スリープなし
  - RDS セッション時間制限を無効化（Windows Server）
  - RDP 切断時にコンソールへ戻すバッチ（tscon）を配置

.NOTES
  管理者で実行。パスワードは扱わない（AutoLogon は別スクリプト）。
  リポジトリに秘密を書かない。
#>
param(
  [string]$SetupDir = "C:\kabu-setup"
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

Write-Host "==> Disable screensaver / secure screen saver (HKCU)"
$desktop = "HKCU:\Control Panel\Desktop"
New-Item -Path $desktop -Force | Out-Null
Set-ItemProperty -Path $desktop -Name "ScreenSaveActive" -Value "0" -Type String
Set-ItemProperty -Path $desktop -Name "ScreenSaverIsSecure" -Value "0" -Type String
# Prefer blank timeout 0
Set-ItemProperty -Path $desktop -Name "ScreenSaveTimeOut" -Value "0" -Type String -ErrorAction SilentlyContinue

Write-Host "==> Power plan: never turn off display / sleep / hibernate (AC)"
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
powercfg /change disk-timeout-ac 0 | Out-Null
# On battery (rare on Azure) same
powercfg /change monitor-timeout-dc 0 | Out-Null
powercfg /change standby-timeout-dc 0 | Out-Null
powercfg /change hibernate-timeout-dc 0 | Out-Null

Write-Host "==> Terminal Services: no idle / disconnected session timeouts (machine policy)"
$ts = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services"
New-Item -Path $ts -Force | Out-Null
# 0 = never (matches gpedit「なし」)
New-ItemProperty -Path $ts -Name "MaxIdleTime" -PropertyType DWord -Value 0 -Force | Out-Null
New-ItemProperty -Path $ts -Name "MaxDisconnectionTime" -PropertyType DWord -Value 0 -Force | Out-Null
New-ItemProperty -Path $ts -Name "MaxConnectionTime" -PropertyType DWord -Value 0 -Force | Out-Null
# Do not end session when time limits are reached
New-ItemProperty -Path $ts -Name "fResetBroken" -PropertyType DWord -Value 0 -Force | Out-Null

# Prefer PowerShell disconnect (session-id + JP/EN + SYSTEM fallback).
# %sessionname% in a double-clicked bat is unreliable and often "does nothing".
foreach ($helper in @(
  "Keep-KabuConsoleSession.ps1",
  "Disconnect-Rdp-KeepDesktop.ps1"
)) {
  $srcHelper = Join-Path $PSScriptRoot $helper
  $dstHelper = Join-Path $SetupDir $helper
  if ((Test-Path -LiteralPath $srcHelper) -and ($srcHelper -ne $dstHelper)) {
    Copy-Item $srcHelper $dstHelper -Force
    Write-Host ("COPY_OK " + $helper)
  }
}

$disconnectPs1 = Join-Path $SetupDir "Disconnect-Rdp-KeepDesktop.ps1"
$disconnectBat = Join-Path $SetupDir "Disconnect-Rdp-KeepDesktop.bat"
Write-Host "==> Write $disconnectBat (wrapper -> $disconnectPs1)"
@"
@echo off
REM Do not use tscon %sessionname% here - Explorer launches a new console and it fails silently.
REM PowerShell resolves Active/Disc session id (EN+JP) and falls back to a SYSTEM one-shot.
echo Detaching RDP session to console (keep desktop active for kabu sync)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$disconnectPs1" -SetupDir "$SetupDir"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo FAILED exit=%ERR% - see %SetupDir%\disconnect-rdp.log
  echo After X close, SYSTEM watchdog still recovers Disc-to-console within ~1 minute.
  pause
)
exit /b %ERR%
"@ | Set-Content -Path $disconnectBat -Encoding ASCII

Write-Host @"

==> Session keep-alive done
1. Preferred disconnect: $disconnectBat (or desktop shortcut 4)
2. X close is recovered by SYSTEM task kabu-bridge-console-keepalive (~1 min)
3. AutoLogon: Enable-KabuAutoLogon.ps1 / kabu start: Configure-KabuAutostart.ps1
"@
