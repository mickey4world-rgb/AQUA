#Requires -Version 5.1
# Bootstrap kabu host on Azure Windows VM (Run Command). No kabu login / no API passwords.
$ErrorActionPreference = "Stop"
$BridgeRoot = "C:\kabu-bridge"
$SetupDir = "C:\kabu-setup"
$Desktop = [Environment]::GetFolderPath("Desktop")
New-Item -ItemType Directory -Force -Path $BridgeRoot, $SetupDir | Out-Null

Write-Host "==> Node.js LTS"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $msi = Join-Path $SetupDir "node-lts.msi"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi" -OutFile $msi -UseBasicParsing
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
node -v
npm -v

Write-Host "==> Fetch kabu-bridge from GitHub"
$zip = Join-Path $SetupDir "aqua-main.zip"
Invoke-WebRequest -Uri "https://github.com/mickey4world-rgb/AQUA/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
$extract = Join-Path $SetupDir "aqua-extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force
$src = Get-ChildItem $extract -Directory | Select-Object -First 1
$bridgeSrc = Join-Path $src.FullName "tools\kabu-bridge"
Copy-Item -Path (Join-Path $bridgeSrc "*") -Destination $BridgeRoot -Recurse -Force

Push-Location $BridgeRoot
try { npm install --omit=dev } finally { Pop-Location }

Write-Host "==> Windows Firewall block 18080/18081"
foreach ($port in @(18080, 18081)) {
  $ruleName = "Block-KabuApi-Inbound-$port"
  if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Block -Direction Inbound | Out-Null
  } else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Block -Protocol TCP -LocalPort $port -Profile Any -Enabled True | Out-Null
  }
}

Write-Host "==> Download kabuStation installer (GUI install still required)"
$installer = Join-Path $SetupDir "kabuStation_Installer.exe"
try {
  Invoke-WebRequest -Uri "https://download.r30.kabu.co.jp/ap/kabustation/kabuStation_Installer.exe" -OutFile $installer -UseBasicParsing
} catch {
  Write-Host "Installer download failed (may need browser): $($_.Exception.Message)"
}

Write-Host "==> WebView2 Runtime (often required by kabu)"
try {
  $wv = Join-Path $SetupDir "MicrosoftEdgeWebView2Setup.exe"
  Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $wv -UseBasicParsing
  Start-Process $wv -ArgumentList "/silent /install" -Wait
} catch {
  Write-Host "WebView2 install skipped: $($_.Exception.Message)"
}

Write-Host "BOOTSTRAP_OK"
