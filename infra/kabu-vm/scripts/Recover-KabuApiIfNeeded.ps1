#Requires -Version 5.1
<#
.SYNOPSIS
  If kabu localhost API token fails, restart kabuStation and re-probe.
  Does not replace OTP when the station truly needs login — reports that clearly.
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  [int]$WaitReadyMinutes = 2
)

$ErrorActionPreference = "Continue"
$log = Join-Path $SetupDir "api-recover.log"
function Log([string]$m) {
  $line = ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m)
  Add-Content -Path $log -Value $line -Encoding ASCII
  Write-Host $line
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npm) { $npmCmd = $npm.Source } else {
  $npmCmd = @(
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files (x86)\nodejs\npm.cmd"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $npmCmd) { Log "NO_NPM"; exit 1 }
if (-not (Test-Path (Join-Path $BridgeRoot "package.json"))) { Log "NO_BRIDGE"; exit 1 }

function Test-TokenOk {
  Push-Location $BridgeRoot
  try {
    & $npmCmd run health >> $log 2>&1
    return ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
  }
}

if (Test-TokenOk) {
  Log "TOKEN_OK"
  exit 0
}

Log "TOKEN_FAIL — attempting kabuStation restart"

function Find-KabuExe {
  $candidates = @(
    "${env:ProgramFiles}\kabuStation\kabuStation.exe",
    "${env:ProgramFiles(x86)}\kabuStation\kabuStation.exe",
    "${env:LOCALAPPDATA}\kabuStation\kabuStation.exe"
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  $hit = Get-ChildItem -Path "$env:ProgramFiles","${env:ProgramFiles(x86)}","$env:LOCALAPPDATA" `
    -Filter "*kabu*.exe" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'kabuStation|KabuStation' } |
    Select-Object -First 1
  if ($hit) { return $hit.FullName }
  return $null
}

Get-Process | Where-Object { $_.ProcessName -match 'kabu|Kabu' } | ForEach-Object {
  Log ("KILL " + $_.ProcessName + " pid=" + $_.Id)
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3

$exe = Find-KabuExe
if (-not $exe) {
  Log "KABU_EXE_NOT_FOUND — OTP/manual start required"
  exit 2
}

Log ("START " + $exe)
Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe -Parent)
Start-Sleep -Seconds 15

$env:KABU_WAIT_READY_MINUTES = [string]$WaitReadyMinutes
$env:KABU_WAIT_READY_INTERVAL_SEC = "15"
Push-Location $BridgeRoot
try {
  & $npmCmd run wait-ready >> $log 2>&1
  if ($LASTEXITCODE -eq 0) {
    Log "RECOVER_OK"
    exit 0
  }
} finally {
  Pop-Location
}

Log "RECOVER_NEEDS_OTP — station restarted but token still failing; remote OTP required"
exit 3
