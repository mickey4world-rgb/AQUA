#Requires -Version 5.1
# Applied via Azure Run Command. No passwords in this script.
$ErrorActionPreference = "Stop"
$SetupDir = "C:\kabu-setup"
$ScriptsDir = Join-Path $SetupDir "scripts"
New-Item -ItemType Directory -Force -Path $ScriptsDir | Out-Null

$base = "https://raw.githubusercontent.com/mickey4world-rgb/AQUA/main/infra/kabu-vm/scripts"
$files = @(
  "Configure-KabuSessionKeepAlive.ps1",
  "Configure-KabuAutostart.ps1",
  "Enable-KabuAutoLogon.ps1"
)
foreach ($f in $files) {
  $out = Join-Path $ScriptsDir $f
  Write-Host "GET $f"
  Invoke-WebRequest -Uri "$base/$f" -OutFile $out -UseBasicParsing
}

Write-Host "==> Session keep-alive"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptsDir "Configure-KabuSessionKeepAlive.ps1")

Write-Host "==> Download Autologon zip (Enable is separate)"
$zip = Join-Path $SetupDir "AutoLogon.zip"
Invoke-WebRequest -Uri "https://download.sysinternals.com/files/AutoLogon.zip" -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $SetupDir -Force

Write-Host "==> Autostart kabu plus bridge tasks"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptsDir "Configure-KabuAutostart.ps1")

Write-Host "==> Env readiness (names only)"
$envPath = "C:\kabu-bridge\.env"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $parts = $_ -split '=', 2
    $k = $parts[0]
    $v = if ($parts.Count -gt 1) { $parts[1] } else { "" }
    $set = if ([string]::IsNullOrWhiteSpace($v)) { "EMPTY" } else { "SET" }
    Write-Host ("ENV {0}={1}" -f $k, $set)
  }
} else {
  Write-Host "ENV_MISSING C:\kabu-bridge\.env"
}

Write-Host "==> Processes / paths"
Write-Host ("bridge=" + (Test-Path "C:\kabu-bridge\package.json"))
Write-Host ("disconnectBat=" + (Test-Path "C:\kabu-setup\Disconnect-Rdp-KeepDesktop.bat"))
Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("TASK " + $_.TaskName + " " + $_.State)
}
Get-Process | Where-Object { $_.ProcessName -match 'kabu|Kabu|node' } | ForEach-Object {
  Write-Host ("PROC " + $_.ProcessName + " " + $_.Id)
}
Write-Host "APPLY_OK"
