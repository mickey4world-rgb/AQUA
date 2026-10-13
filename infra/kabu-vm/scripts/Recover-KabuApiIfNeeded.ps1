#Requires -Version 5.1
# ASCII-only. Judgment ladder after OTP: prefer recoveries that do NOT demand OTP again.
# Killing kabuStation every tick was the failure class (office remote cannot re-OTP forever).
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup",
  [int]$WaitReadyMinutes = 2,
  [int]$SoftRetrySeconds = 25,
  [int]$KillCooldownMinutes = 45
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

function Write-State([string]$status, [bool]$killed = $false) {
  $prev = Read-State
  $obj = [ordered]@{
    lastStatus = $status
    lastOkAt   = if ($status -eq "ok" -or $status -eq "soft_ok" -or $status -eq "restarted_ok") { (Get-Date).ToString("o") } else { $prev.lastOkAt }
    lastKillAt = if ($killed) { (Get-Date).ToString("o") } else { $prev.lastKillAt }
    updatedAt  = (Get-Date).ToString("o")
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
    Where-Object { $_.Name -match "kabuStation|KabuStation" } |
    Select-Object -First 1
  if ($hit) { return $hit.FullName }
  return $null
}

function Test-IsJpMarketHoursRough {
  # TSE cash: weekdays 09:00-11:30 / 12:30-15:30 JST (2024-11+). Holiday skip is best-effort elsewhere.
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
  # Failure class: token OK but Interactive market-tick dead → AQUA sync ages out while UI API looks fine.
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

# --- Ladder ---
if (Test-TokenOk) {
  Log "JUDGE=ok TOKEN_OK"
  Write-State "ok"
  Ensure-AquaSyncIfStale
  Report-Recovery "ok" "none" $true $true $null
  exit 0
}

Log "JUDGE=token_fail — soft wait (no kill; OTP-safe)"
Start-Sleep -Seconds $SoftRetrySeconds
if (Test-TokenOk) {
  Log "JUDGE=soft_ok after wait (likely Disc->console / API settle)"
  Write-State "soft_ok"
  Ensure-AquaSyncIfStale
  Report-Recovery "soft_ok" "soft_wait" $true $true $null
  exit 0
}

$alive = Test-ProcessAlive
$state = Read-State
$killAgeMin = $null
if ($state.lastKillAt) {
  try { $killAgeMin = ((Get-Date) - [datetime]$state.lastKillAt).TotalMinutes } catch { $killAgeMin = $null }
}

# Cooldown: do not thrash restart (forces OTP from office)
if ($killAgeMin -ne $null -and $killAgeMin -lt $KillCooldownMinutes) {
  $msg = "cooldown skip kill; lastKillAgeMin=" + [int]$killAgeMin + " processAlive=" + $alive
  Log ("JUDGE=needs_otp " + $msg)
  Write-State "needs_otp"
  Report-Recovery "needs_otp" "cooldown_no_kill" $false $alive $msg
  exit 3
}

if (-not $alive) {
  Log "JUDGE=process_missing — start station once"
} else {
  Log "JUDGE=half_dead — one restart after cooldown cleared"
}

Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match "kabu|Kabu" } | ForEach-Object {
  Log ("KILL " + $_.ProcessName + " pid=" + $_.Id)
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3
Write-State "restarting" $true

$exe = Find-KabuExe
if (-not $exe) {
  Log "JUDGE=needs_otp KABU_EXE_NOT_FOUND"
  Write-State "needs_otp"
  Report-Recovery "needs_otp" "exe_missing" $false $false "KABU_EXE_NOT_FOUND"
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
    Log "JUDGE=restarted_ok"
    Write-State "restarted_ok"
    Ensure-AquaSyncIfStale
    Report-Recovery "restarted_ok" "station_restart" $true $true $null
    exit 0
  }
} finally {
  Pop-Location
}

Log "JUDGE=needs_otp station restarted but token still failing — remote OTP required"
Write-State "needs_otp"
Report-Recovery "needs_otp" "restart_needs_otp" $false $true "RECOVER_NEEDS_OTP"
exit 3
