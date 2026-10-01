#Requires -Version 5.1
# Run as SYSTEM via Azure Run Command. Target interactive user: aquaadmin.
$ErrorActionPreference = "Stop"
$TargetUser = "aquaadmin"
$BridgeRoot = "C:\kabu-bridge"
$SetupDir = "C:\kabu-setup"
New-Item -ItemType Directory -Force -Path $SetupDir | Out-Null

$startup = "C:\Users\$TargetUser\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
New-Item -ItemType Directory -Force -Path $startup | Out-Null
Write-Host ("Startup=" + $startup)

$kabu = $null
$roots = @(
  "C:\Program Files",
  "C:\Program Files (x86)",
  "C:\Users\$TargetUser\AppData\Local",
  "C:\Users\$TargetUser\Desktop",
  "C:\kabu-setup"
)
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  $hit = Get-ChildItem -Path $root -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'kabu|Kabu|kabustation|KabuStation' } |
    Select-Object -First 1
  if ($hit) { $kabu = $hit.FullName; break }
}
if ($kabu) {
  Write-Host ("KabuExe=" + $kabu)
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut((Join-Path $startup "kabuStation.lnk"))
  $lnk.TargetPath = $kabu
  $lnk.WorkingDirectory = Split-Path $kabu -Parent
  $lnk.Save()
  Write-Host "KabuShortcut=OK"
} else {
  Write-Host "KabuExe=NOT_FOUND"
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
if (-not $npm) {
  $nodeDirs = @(
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files (x86)\nodejs\npm.cmd"
  )
  foreach ($n in $nodeDirs) {
    if (Test-Path $n) { $npmCmd = $n; break }
  }
} else {
  $npmCmd = $npm.Source
}
Write-Host ("npm=" + $npmCmd)

function Write-Cmd([string]$Path, [string[]]$Lines) {
  Set-Content -Path $Path -Value $Lines -Encoding ASCII
}

function Reg-Task([string]$Name, [string]$Cmd, [bool]$Logon, [int]$EveryMin) {
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ("/c `"" + $Cmd + "`"")
  $triggers = @()
  if ($Logon) {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $TargetUser
  }
  if ($EveryMin -gt 0) {
    $triggers += New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(3) `
      -RepetitionInterval (New-TimeSpan -Minutes $EveryMin) `
      -RepetitionDuration (New-TimeSpan -Days 3650)
  }
  $principal = New-ScheduledTaskPrincipal -UserId $TargetUser -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $triggers `
    -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host ("TASK_OK " + $Name)
}

if ((Test-Path (Join-Path $BridgeRoot "package.json")) -and $npmCmd) {
  Write-Cmd (Join-Path $SetupDir "run-sync.cmd") @(
    "@echo off",
    ("cd /d " + $BridgeRoot),
    ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
  )
  Write-Cmd (Join-Path $SetupDir "run-trade.cmd") @(
    "@echo off",
    ("cd /d " + $BridgeRoot),
    ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
  )
  Write-Cmd (Join-Path $SetupDir "run-sync-after-logon.cmd") @(
    "@echo off",
    "timeout /t 180 /nobreak >nul",
    ("cd /d " + $BridgeRoot),
    ("`"" + $npmCmd + "`" run probe >> `"" + $SetupDir + "\probe.log`" 2>&1"),
    ("`"" + $npmCmd + "`" run sync >> `"" + $SetupDir + "\sync.log`" 2>&1")
  )
  Write-Cmd (Join-Path $SetupDir "run-trade-after-logon.cmd") @(
    "@echo off",
    "timeout /t 240 /nobreak >nul",
    ("cd /d " + $BridgeRoot),
    ("`"" + $npmCmd + "`" run trade >> `"" + $SetupDir + "\trade.log`" 2>&1")
  )
  Reg-Task "kabu-bridge-sync" (Join-Path $SetupDir "run-sync.cmd") $false 15
  Reg-Task "kabu-bridge-trade" (Join-Path $SetupDir "run-trade.cmd") $false 15
  Reg-Task "kabu-bridge-logon-sync" (Join-Path $SetupDir "run-sync-after-logon.cmd") $true 0
  Reg-Task "kabu-bridge-logon-trade" (Join-Path $SetupDir "run-trade-after-logon.cmd") $true 0
} else {
  Write-Host "BRIDGE_OR_NPM_MISSING"
}

# LIVE readiness peek (values only for gate flags)
$envPath = Join-Path $BridgeRoot ".env"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*KABU_ALLOW_LIVE_ORDERS\s*=\s*(.*)$') {
      Write-Host ("LIVE_FLAG=" + $Matches[1].Trim())
    }
    if ($_ -match '^\s*KABU_BASE_URL\s*=\s*(.*)$') {
      Write-Host ("BASE_URL=" + $Matches[1].Trim())
    }
    if ($_ -match '^\s*AQUA_USER_ID\s*=\s*(.+)$') {
      $uid = $Matches[1].Trim()
      if ($uid.Length -gt 8) {
        Write-Host ("USER_ID_PREFIX=" + $uid.Substring(0, 8))
      } else {
        Write-Host ("USER_ID_PREFIX=" + $uid)
      }
    }
  }
}

Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("TASK " + $_.TaskName + " " + $_.State)
}
Write-Host "AQUAADMIN_AUTOSTART_OK"
