#Requires -Version 5.1
# Re-apply autostart only (ASCII). Fetches fixed script from GitHub main after push.
$ErrorActionPreference = "Stop"
$SetupDir = "C:\kabu-setup"
$ScriptsDir = Join-Path $SetupDir "scripts"
New-Item -ItemType Directory -Force -Path $ScriptsDir | Out-Null
$url = "https://raw.githubusercontent.com/mickey4world-rgb/AQUA/main/infra/kabu-vm/scripts/Configure-KabuAutostart.ps1"
$out = Join-Path $ScriptsDir "Configure-KabuAutostart.ps1"
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $out
Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("TASK " + $_.TaskName + " " + $_.State)
}
Write-Host "REAPPLY_OK"
