#Requires -Version 5.1
<#
.SYNOPSIS
  Move the current aquaadmin RDP session to console and drop the RDP client.
  Prefer this over closing Windows App / RDP with X.

.NOTES
  Uses Keep-KabuConsoleSession.ps1 -Mode DisconnectActive (session-id based,
  JP/EN locale, SYSTEM one-shot fallback when direct tscon is Access Denied).
#>
param(
  [string]$SetupDir = "C:\kabu-setup",
  [string]$TargetUser = "aquaadmin"
)

$ErrorActionPreference = "Continue"
$keep = Join-Path $SetupDir "Keep-KabuConsoleSession.ps1"
if (-not (Test-Path -LiteralPath $keep)) {
  $keep = Join-Path $PSScriptRoot "Keep-KabuConsoleSession.ps1"
}
if (-not (Test-Path -LiteralPath $keep)) {
  Write-Host "ERROR: Keep-KabuConsoleSession.ps1 not found"
  Start-Sleep -Seconds 8
  exit 1
}

Write-Host "Disconnecting RDP to console (desktop stays alive for kabu sync)..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $keep `
  -Mode DisconnectActive -SetupDir $SetupDir -TargetUser $TargetUser
$rc = $LASTEXITCODE
if ($rc -ne 0) {
  Write-Host ""
  Write-Host "FAILED (exit $rc). Log: $SetupDir\disconnect-rdp.log"
  Write-Host "SYSTEM watchdog should still bounce Disc->console within ~1 minute after X."
  Start-Sleep -Seconds 10
}
exit $rc
