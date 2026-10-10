#Requires -Version 5.1
# ASCII-only source (Windows PowerShell 5.1 / Azure Run Command safe).
# Bounce aquaadmin RDP Disc sessions to console so kabu GUI/API keep running after X close.
# Modes: RecoverDisc (watchdog) | DisconnectActive (manual shortcut 4)
param(
  [ValidateSet("RecoverDisc", "DisconnectActive")]
  [string]$Mode = "RecoverDisc",
  [string]$TargetUser = "aquaadmin",
  [string]$SetupDir = "C:\kabu-setup",
  [switch]$SelfTest
)

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path $SetupDir | Out-Null
$log = Join-Path $SetupDir "console-keepalive.log"
if ($Mode -eq "DisconnectActive") {
  $log = Join-Path $SetupDir "disconnect-rdp.log"
}

# JP locale qwinsta tokens (built at runtime; do not embed UTF-8 literals in this file)
$JpDisc = ([string][char]0x5207) + ([char]0x65AD)
$JpActive = -join ([char[]]@(0x30A2, 0x30AF, 0x30C6, 0x30A3, 0x30D6))
$JpSessionHdr = -join ([char[]]@(0x30BB, 0x30C3, 0x30B7, 0x30E7, 0x30F3, 0x540D))
$JpUserHdr = -join ([char[]]@(0x30E6, 0x30FC, 0x30B6, 0x30FC, 0x540D))

function Log([string]$m) {
  $line = ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m)
  Add-Content -Path $log -Value $line -Encoding ASCII
  Write-Host $line
}

function Test-IsDisconnectedState([string]$state) {
  if (-not $state) { return $false }
  if ($state.Contains($JpDisc)) { return $true }
  $s = $state.ToLowerInvariant()
  return ($s.StartsWith("disc"))
}

function Test-IsActiveState([string]$state) {
  if (-not $state) { return $false }
  if ($state.Contains($JpActive)) { return $true }
  $s = $state.ToLowerInvariant()
  return ($s -eq "active")
}

function Get-UserSessionRows {
  param(
    [string]$Raw,
    [string]$User
  )
  $rows = @()
  foreach ($line in ($Raw -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -match "SESSIONNAME|USERNAME") { continue }
    if ($line.Contains($JpSessionHdr) -or $line.Contains($JpUserHdr)) { continue }
    if ($line -notmatch [regex]::Escape($User)) { continue }
    if ($line -match ("(?i)\b" + [regex]::Escape($User) + "\s+(\d+)\s+(\S+)")) {
      $rows += [pscustomobject]@{
        Id    = [int]$Matches[1]
        State = [string]$Matches[2]
        Line  = $line.Trim()
      }
    }
  }
  return $rows
}

function Invoke-TsconToConsole {
  param([int]$SessionId)
  $tscon = Join-Path $env:SystemRoot "System32\tscon.exe"
  Log ("TSCON_TRY session=" + $SessionId)
  $p = Start-Process -FilePath $tscon -ArgumentList @("$SessionId", "/dest:console") `
    -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -eq 0) {
    Log ("TSCON_OK session=" + $SessionId)
    return 0
  }
  Log ("TSCON_DIRECT_FAIL exit=" + $p.ExitCode + " - trying SYSTEM one-shot task")

  $taskName = "kabu-tscon-once-" + $SessionId
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  try {
    $action = New-ScheduledTaskAction -Execute $tscon -Argument ("{0} /dest:console" -f $SessionId)
    $prin = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $prin -Settings $set -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    $deadline = (Get-Date).AddSeconds(15)
    $info = $null
    do {
      Start-Sleep -Milliseconds 400
      $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
      if ($info -and $info.LastTaskResult -eq 0 -and $info.LastRunTime -gt (Get-Date).AddMinutes(-1)) {
        Log ("TSCON_SYSTEM_OK session=" + $SessionId)
        return 0
      }
    } while ((Get-Date) -lt $deadline)
    $last = 1
    if ($info) { $last = $info.LastTaskResult }
    Log ("TSCON_SYSTEM_FAIL lastResult=" + $last)
    return $last
  } catch {
    Log ("TSCON_SYSTEM_ERROR " + $_.Exception.Message)
    return 1
  } finally {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  }
}

if ($SelfTest) {
  $en = @"
 SESSIONNAME       USERNAME                 ID  STATE
 services                                    0  Disc
>rdp-tcp#0         aquaadmin                 2  Disc
 rdp-tcp#1         aquaadmin                 3  Active
"@
  $jpHdr = " " + $JpSessionHdr + "       " + $JpUserHdr + "               ID  STATE"
  $jp = $jpHdr + "`n>rdp-tcp#0         aquaadmin                 2  " + $JpDisc + "`n rdp-tcp#1         aquaadmin                 3  " + $JpActive + "`n"
  $enRows = @(Get-UserSessionRows -Raw $en -User "aquaadmin")
  $jpRows = @(Get-UserSessionRows -Raw $jp -User "aquaadmin")
  $ok = $true
  if (@($enRows | Where-Object { $_.Id -eq 2 -and (Test-IsDisconnectedState $_.State) }).Count -ne 1) {
    Write-Host "SELFTEST_FAIL en Disc"; $ok = $false
  }
  if (@($enRows | Where-Object { $_.Id -eq 3 -and (Test-IsActiveState $_.State) }).Count -ne 1) {
    Write-Host "SELFTEST_FAIL en Active"; $ok = $false
  }
  if (@($jpRows | Where-Object { $_.Id -eq 2 -and (Test-IsDisconnectedState $_.State) }).Count -ne 1) {
    Write-Host "SELFTEST_FAIL jp Disc"; $ok = $false
  }
  if (@($jpRows | Where-Object { $_.Id -eq 3 -and (Test-IsActiveState $_.State) }).Count -ne 1) {
    Write-Host "SELFTEST_FAIL jp Active"; $ok = $false
  }
  if ($ok) {
    Write-Host "SELFTEST_OK"
    exit 0
  }
  exit 1
}

if ($Mode -eq "RecoverDisc") {
  Start-Sleep -Seconds 2
}

$raw = qwinsta 2>$null | Out-String
if (-not $raw) {
  Log "QWINSTA_EMPTY"
  exit 0
}

$rows = @(Get-UserSessionRows -Raw $raw -User $TargetUser)
if ($rows.Count -eq 0) {
  Log ("OK_NO_SESSION user=" + $TargetUser)
  exit 0
}

$targets = @()
if ($Mode -eq "RecoverDisc") {
  $targets = @($rows | Where-Object { Test-IsDisconnectedState $_.State })
  if ($targets.Count -eq 0) {
    Log ("OK_NO_DISC_SESSION states=" + (($rows | ForEach-Object { $_.State }) -join ","))
    exit 0
  }
} else {
  $targets = @($rows | Where-Object { Test-IsActiveState $_.State })
  if ($targets.Count -eq 0) {
    $targets = @($rows | Where-Object { Test-IsDisconnectedState $_.State })
  }
  if ($targets.Count -eq 0) {
    Log ("NO_ACTIVE_OR_DISC count=" + $rows.Count)
    Write-Host ("No Active/Disc session for " + $TargetUser + ". See " + $log)
    exit 1
  }
}

$code = 0
foreach ($t in $targets) {
  Log ("MODE=" + $Mode + " " + $t.Line)
  $rc = Invoke-TsconToConsole -SessionId $t.Id
  if ($rc -ne 0) { $code = $rc }
}
exit $code
