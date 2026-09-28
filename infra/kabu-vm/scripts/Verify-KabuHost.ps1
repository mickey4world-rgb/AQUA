$ErrorActionPreference = "Continue"
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($machinePath -notlike "*nodejs*") {
  [Environment]::SetEnvironmentVariable("Path", $machinePath + ";C:\Program Files\nodejs", "Machine")
}
$node = "C:\Program Files\nodejs\node.exe"
Write-Host ("node=" + (& $node -v))
Write-Host ("bridge=" + (Test-Path "C:\kabu-bridge\package.json"))
Write-Host ("env=" + (Test-Path "C:\kabu-bridge\.env"))
Write-Host ("installer=" + (Test-Path "C:\kabu-setup\kabuStation_Installer.exe"))
Write-Host ("guidePublic=" + (Test-Path "C:\Users\Public\Desktop\KABU-SETUP.txt"))
Get-Content "C:\kabu-bridge\.env" | ForEach-Object {
  if ($_ -match "PASSWORD|SECRET|TRADE") { ($_ -replace "=.*", "=***") } else { $_ }
}
Write-Host "VERIFY_OK"
