#Requires -Version 5.1
# Azure Run Command / RDP: refresh C:\kabu-bridge from main + re-register sync tasks.
# Does not touch .env or API passwords.
$ErrorActionPreference = "Stop"
$BridgeRoot = "C:\kabu-bridge"
$SetupDir = "C:\kabu-setup"
New-Item -ItemType Directory -Force -Path $BridgeRoot, $SetupDir | Out-Null

Write-Host "==> Fetch AQUA main.zip"
$zip = Join-Path $SetupDir "aqua-main.zip"
Invoke-WebRequest -Uri "https://github.com/mickey4world-rgb/AQUA/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
$extract = Join-Path $SetupDir "aqua-extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force
$src = Get-ChildItem $extract -Directory | Select-Object -First 1
$bridgeSrc = Join-Path $src.FullName "tools\kabu-bridge"
if (-not (Test-Path (Join-Path $bridgeSrc "package.json"))) { throw "bridge src missing" }
# Keep .env
$envBackup = Join-Path $SetupDir "kabu-bridge.env.bak"
if (Test-Path (Join-Path $BridgeRoot ".env")) {
  Copy-Item (Join-Path $BridgeRoot ".env") $envBackup -Force
}
Copy-Item -Path (Join-Path $bridgeSrc "*") -Destination $BridgeRoot -Recurse -Force
if (Test-Path $envBackup) {
  Copy-Item $envBackup (Join-Path $BridgeRoot ".env") -Force
}

$scriptsDir = Join-Path $SetupDir "scripts"
New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
$ensureSrc = Join-Path $src.FullName "infra\kabu-vm\scripts\Ensure-KabuSyncAutomation.ps1"
Copy-Item $ensureSrc (Join-Path $scriptsDir "Ensure-KabuSyncAutomation.ps1") -Force
Copy-Item $ensureSrc (Join-Path $SetupDir "Ensure-KabuSyncAutomation.ps1") -Force

foreach ($scriptName in @(
  "Ensure-KabuSyncAutomation.ps1",
  "Configure-KabuDesktopShortcuts.ps1",
  "Configure-KabuSessionKeepAlive.ps1",
  "Keep-KabuConsoleSession.ps1",
  "Recover-KabuApiIfNeeded.ps1"
)) {
  $p = Join-Path $src.FullName ("infra\kabu-vm\scripts\" + $scriptName)
  if (Test-Path -LiteralPath $p) {
    Copy-Item $p (Join-Path $scriptsDir $scriptName) -Force
    Copy-Item $p (Join-Path $SetupDir $scriptName) -Force
  }
}
if (Test-Path (Join-Path $SetupDir "Configure-KabuSessionKeepAlive.ps1")) {
  Write-Host "==> Ensure Disconnect-Rdp bat exists"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $SetupDir "Configure-KabuSessionKeepAlive.ps1") `
    -SetupDir $SetupDir
}

Write-Host "==> Register tasks (wait-ready / Daily 07:05)"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $SetupDir "Ensure-KabuSyncAutomation.ps1") `
  -BridgeRoot $BridgeRoot -SetupDir $SetupDir

if (Test-Path (Join-Path $SetupDir "Configure-KabuDesktopShortcuts.ps1")) {
  Write-Host "==> Desktop / Start Menu shortcuts + disable Server Manager"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $SetupDir "Configure-KabuDesktopShortcuts.ps1") `
    -SetupDir $SetupDir
}

Write-Host ("wait-ready=" + (Test-Path (Join-Path $BridgeRoot "src\wait-ready.mjs")))
Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("TASK " + $_.TaskName + " " + $_.State)
}
Write-Host "UPDATE_BRIDGE_OK"
