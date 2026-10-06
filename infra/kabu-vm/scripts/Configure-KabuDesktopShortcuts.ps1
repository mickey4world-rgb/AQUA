#Requires -Version 5.1
# Morning flow shortcuts on Desktop + Start Menu; suppress Server Manager.
# ASCII-only source (Windows PowerShell 5.1 / Run Command safe).
#   3 = Sync-Now
#   4 = Disconnect-Rdp-KeepDesktop (tscon)
param(
  [string]$SetupDir = "C:\kabu-setup",
  [string]$TargetUser = "aquaadmin"
)

$ErrorActionPreference = "Stop"

$syncCmd = Join-Path $SetupDir "Sync-Now.cmd"
$disconnectBat = Join-Path $SetupDir "Disconnect-Rdp-KeepDesktop.bat"
if (-not (Test-Path -LiteralPath $syncCmd)) {
  throw ("Missing " + $syncCmd + " - run Ensure-KabuSyncAutomation.ps1 first")
}
if (-not (Test-Path -LiteralPath $disconnectBat)) {
  throw ("Missing " + $disconnectBat + " - run Configure-KabuSessionKeepAlive.ps1 first")
}

$userProfile = "C:\Users\$TargetUser"
$desktop = Join-Path $userProfile "Desktop"
$startMenu = Join-Path $userProfile "AppData\Roaming\Microsoft\Windows\Start Menu\Programs"
$publicDesktop = "C:\Users\Public\Desktop"
New-Item -ItemType Directory -Force -Path $desktop, $startMenu | Out-Null

$w = New-Object -ComObject WScript.Shell

function New-Lnk([string]$Path, [string]$Target, [string]$WorkDir, [string]$Desc) {
  $lnk = $w.CreateShortcut($Path)
  $lnk.TargetPath = $Target
  $lnk.WorkingDirectory = $WorkDir
  $lnk.WindowStyle = 1
  $lnk.Description = $Desc
  $lnk.Save()
  Write-Host ("LNK_OK " + $Path)
}

$names = @(
  @{
    File = "3 Sync-Now.lnk"
    Target = $syncCmd
    WorkDir = $SetupDir
    Desc = "After OTP/green: sync cash and holdings to AQUA"
  },
  @{
    File = "4 Disconnect-RDP-KeepDesktop.lnk"
    Target = $disconnectBat
    WorkDir = $SetupDir
    Desc = "Do not close RDP with X. tscon keeps desktop alive"
  }
)

foreach ($n in $names) {
  foreach ($dir in @($desktop, $startMenu)) {
    New-Lnk (Join-Path $dir $n.File) $n.Target $n.WorkDir $n.Desc
  }
}

Write-Host "==> Disable Server Manager at logon"
foreach ($hive in @(
  "HKLM:\SOFTWARE\Microsoft\ServerManager",
  "HKCU:\Software\Microsoft\ServerManager"
)) {
  try {
    if (-not (Test-Path $hive)) { New-Item -Path $hive -Force | Out-Null }
    New-ItemProperty -Path $hive -Name "DoNotOpenServerManagerAtLogon" `
      -PropertyType DWord -Value 1 -Force | Out-Null
    Write-Host ("REG_OK " + $hive)
  } catch {
    Write-Host ("REG_SKIP " + $hive)
  }
}

try {
  $sid = (New-Object System.Security.Principal.NTAccount($TargetUser)).Translate(
    [System.Security.Principal.SecurityIdentifier]
  ).Value
  $userSm = "Registry::HKEY_USERS\$sid\Software\Microsoft\ServerManager"
  if (-not (Test-Path $userSm)) { New-Item -Path $userSm -Force | Out-Null }
  New-ItemProperty -Path $userSm -Name "DoNotOpenServerManagerAtLogon" `
    -PropertyType DWord -Value 1 -Force | Out-Null
  Write-Host ("REG_OK " + $userSm)
} catch {
  Write-Host ("REG_USER_SKIP " + $_.Exception.Message)
}

Get-ScheduledTask -ErrorAction SilentlyContinue |
  Where-Object { $_.TaskName -like "ServerManager*" } |
  ForEach-Object {
    Disable-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue | Out-Null
    Write-Host ("TASK_DISABLED " + $_.TaskName)
  }

$junkPatterns = @(
  "*Server Manager*",
  "*ServerManager*",
  "*Internet Explorer*",
  "*Microsoft Edge.lnk"
)
foreach ($dir in @($desktop, $publicDesktop)) {
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  Get-ChildItem -LiteralPath $dir -Filter "*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($pat in $junkPatterns) {
      if ($_.Name -like $pat) {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
        Write-Host ("DESKTOP_REMOVED " + $_.FullName)
      }
    }
  }
}

$startup = Join-Path $userProfile "AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
if (Test-Path $startup) {
  Get-ChildItem -LiteralPath $startup -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*ServerManager*" } |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      Write-Host ("STARTUP_REMOVED " + $_.FullName)
    }
}

Write-Host "DESKTOP_SHORTCUTS_OK"
