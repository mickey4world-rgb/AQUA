#Requires -Version 5.1
# ASCII-only.
# OTP-safe judgment only. NEVER kill or restart kabuStation from automation.
# Killing forces remote OTP again and was the failure class (green station destroyed).
# Allowed actions: soft wait, report needs_otp to AQUA, heal stale AQUA sync when token OK.
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  [int]$SoftRetrySeconds = 25
)

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path $SetupDir | Out-Null
$log = Join-Path $SetupDir "api-recover.log"
$statePath = Join-Path $SetupDir "api-recover.state.json"

function Log([string]$m) {
  $line = ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m)
  Add-Content -Path $log -Value $line -Encoding ASCII
  Write-Host $line
}

function Read-State {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return [pscustomobject]@{ lastKillAt = $null; lastOkAt = $null; lastStatus = "unknown" }
  }
  try {
    return Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{ lastKillAt = $null; lastOkAt = $null; lastStatus = "unknown" }
  }
}

function Write-State([string]$status) {
  $prev = Read-State
  $obj = [ordered]@{
    lastStatus = $status
    lastOkAt   = if ($status -eq "ok" -or $status -eq "soft_ok") { (Get-Date).ToString("o") } else { $prev.lastOkAt }
    lastKillAt = $prev.lastKillAt
    updatedAt  = (Get-Date).ToString("o")
    neverKill  = $true
  }
  ($obj | ConvertTo-Json -Compress) | Set-Content -Path $statePath -Encoding ASCII
}

function Report-Recovery([string]$status, [string]$action, [bool]$tokenOk, [bool]$reachable, [string]$err) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) { $npmCmd = $npm.Source } else {
    $npmCmd = @(
      "C:\Program Files\nodejs\npm.cmd",
      "C:\Program Files (x86)\nodejs\npm.cmd"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  }
  if (-not $npmCmd) { return }
  if (-not (Test-Path (Join-Path $BridgeRoot "package.json"))) { return }
  $env:KABU_RECOVERY_STATUS = $status
  $env:KABU_RECOVERY_ACTION = $action
  $env:KABU_RECOVERY_TOKEN_OK = $(if ($tokenOk) { "1" } else { "0" })
  $env:KABU_RECOVERY_REACHABLE = $(if ($reachable) { "1" } else { "0" })
  $env:KABU_RECOVERY_ERROR = $err
  Push-Location $BridgeRoot
  try {
    & $npmCmd run report-recovery >> $log 2>&1
  } finally {
    Pop-Location
    Remove-Item Env:KABU_RECOVERY_STATUS -ErrorAction SilentlyContinue
    Remove-Item Env:KABU_RECOVERY_ACTION -ErrorAction SilentlyContinue
    Remove-Item Env:KABU_RECOVERY_TOKEN_OK -ErrorAction SilentlyContinue
    Remove-Item Env:KABU_RECOVERY_REACHABLE -ErrorAction SilentlyContinue
    Remove-Item Env:KABU_RECOVERY_ERROR -ErrorAction SilentlyContinue
  }
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

function Test-ProcessAlive {
  return [bool](Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match "kabu|Kabu" })
}

function Test-IsJpMarketHoursRough {
  try {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("Tokyo Standard Time")
  } catch {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("Asia/Tokyo")
  }
  $jst = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
  if ($jst.DayOfWeek -eq [DayOfWeek]::Saturday -or $jst.DayOfWeek -eq [DayOfWeek]::Sunday) {
    return $false
  }
  $mins = ($jst.Hour * 60) + $jst.Minute
  $am = ($mins -ge (9 * 60) -and $mins -lt (11 * 60 + 30))
  $pm = ($mins -ge (12 * 60 + 30) -and $mins -le (15 * 60 + 30))
  return ($am -or $pm)
}

function Ensure-AquaSyncIfStale {
  if (-not (Test-IsJpMarketHoursRough)) {
    Log "AQUA_SYNC_SKIP off_hours"
    return
  }
  $marker = Join-Path $SetupDir "last-aqua-sync.ok"
  $staleMin = 7
  if (Test-Path -LiteralPath $marker) {
    try {
      $age = ((Get-Date) - (Get-Item -LiteralPath $marker).LastWriteTime).TotalMinutes
      if ($age -lt $staleMin) {
        Log ("AQUA_SYNC_FRESH ageMin=" + [int]$age)
        return
      }
    } catch { }
  }
  Push-Location $BridgeRoot
  try {
    & $npmCmd run sync >> $log 2>&1
    if ($LASTEXITCODE -eq 0) {
      (Get-Date).ToString("o") | Set-Content -Path $marker -Encoding ASCII
      Log "AQUA_SYNC_OK stale-heal"
    } else {
      Log ("AQUA_SYNC_FAIL exit=" + $LASTEXITCODE)
    }
  } finally {
    Pop-Location
  }
}

# --- Ladder (no kill / no restart) ---
if (Test-TokenOk) {
  Log "JUDGE=ok TOKEN_OK"
  Write-State "ok"
  Ensure-AquaSyncIfStale
  Report-Recovery "ok" "none" $true $true $null
  exit 0
}

Log "JUDGE=token_fail soft wait (no kill; OTP-safe)"
Start-Sleep -Seconds $SoftRetrySeconds
if (Test-TokenOk) {
  Log "JUDGE=soft_ok after wait (likely Disc->console / API settle)"
  Write-State "soft_ok"
  Ensure-AquaSyncIfStale
  Report-Recovery "soft_ok" "soft_wait" $true $true $null
  exit 0
}

$alive = Test-ProcessAlive
if (-not $alive) {
  Log "JUDGE=needs_otp process_missing (will NOT auto-start; OTP required)"
  Write-State "needs_otp"
  Report-Recovery "needs_otp" "process_missing_no_start" $false $false "PROCESS_MISSING"
  exit 3
}

Log "JUDGE=needs_otp process_alive_but_token_fail (will NOT kill; leave green station alone)"
Write-State "needs_otp"
Report-Recovery "needs_otp" "token_fail_no_kill" $false $true "TOKEN_FAIL_NO_KILL"
exit 3
