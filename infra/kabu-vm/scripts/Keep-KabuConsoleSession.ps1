#Requires -Version 5.1
<#
.SYNOPSIS
  If aquaadmin RDP session is Disconnected, bounce it to console (tscon).
  Azure: closing RDP with X often freezes the interactive desktop and kills kabu API.
#>
param(
  [string]$TargetUser = "aquaadmin",
  [string]$SetupDir = "C:\kabu-setup"
)

$ErrorActionPreference = "Continue"
$log = Join-Path $SetupDir "console-keepalive.log"
function Log([string]$m) {
  $line = ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m)
  Add-Content -Path $log -Value $line -Encoding ASCII
  Write-Host $line
}

# qwinsta columns vary by locale; match username + Disc
$raw = qwinsta 2>$null | Out-String
if (-not $raw) {
  Log "QWINSTA_EMPTY"
  exit 0
}

$hit = $null
foreach ($line in ($raw -split "`r?`n")) {
  if ($line -match [regex]::Escape($TargetUser) -and $line -match "Disc") {
    $hit = $line
    break
  }
}

if (-not $hit) {
  Log "OK_NO_DISC_SESSION"
  exit 0
}

# Session id is usually the numeric token after the session name
$id = $null
if ($hit -match "\s(\d+)\s+Disc") { $id = $Matches[1] }
elseif ($hit -match "\s(\d+)\s+") { $id = $Matches[1] }

if (-not $id) {
  Log ("DISC_NO_ID " + $hit.Trim())
  exit 1
}

Log ("TSCON_TRY session=" + $id)
$p = Start-Process -FilePath "$env:SystemRoot\System32\tscon.exe" `
  -ArgumentList @($id, "/dest:console") -Wait -PassThru -NoNewWindow
Log ("TSCON_EXIT=" + $p.ExitCode)
exit $p.ExitCode
