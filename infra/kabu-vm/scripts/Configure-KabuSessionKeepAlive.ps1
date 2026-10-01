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

$disconnectBat = Join-Path $SetupDir "Disconnect-Rdp-KeepDesktop.bat"
Write-Host "==> Write $disconnectBat"
@"
@echo off
REM Azure 落とし穴対策: RDP の × で閉じるとデスクトップ描画が止まり、
REM kabuステーション / クリック系が止まることがある。
REM この bat を管理者で実行すると、セッションを console に戻したまま RDP だけ切る。
echo Detaching RDP session to console (keep desktop active)...
for /f "tokens=*" %%i in ('qwinsta ^| findstr /i active') do echo %%i
tscon %sessionname% /dest:console
if errorlevel 1 (
  echo FAILED. Run as the logged-on user from an elevated cmd, or:
  echo   query session
  echo   tscon ^<session-id^> /dest:console
  pause
)
"@ | Set-Content -Path $disconnectBat -Encoding ASCII

Write-Host @"

==> Session keep-alive done
1. RDP を切るときは × ではなく: $disconnectBat
2. AutoLogon（再起動後にデスクトップまで）は Enable-KabuAutoLogon.ps1
3. kabu / bridge の起動は Configure-KabuAutostart.ps1
"@
