#Requires -Version 5.1
<#
.SYNOPSIS
  Heal poisoned cash-order defaults before every tick (100378 / 100204 class).
  Safe to run repeatedly. Does not touch passwords or LIVE flag.
#>
param(
  [string]$BridgeRoot = "C:\kabu-bridge",
  [string]$SetupDir = "C:\kabu-setup"
)

$ErrorActionPreference = "Continue"
$healed = @()

$envPath = Join-Path $BridgeRoot ".env"
if (Test-Path $envPath) {
  $lines = Get-Content $envPath
  $dirty = $false
  $new = foreach ($line in $lines) {
    if ($line -match '^\s*KABU_EXCHANGE\s*=\s*1\s*$') {
      $dirty = $true
      "KABU_EXCHANGE=27"
    } elseif ($line -match '^\s*KABU_FUND_TYPE\s*=\s*AA\s*$') {
      $dirty = $true
      "KABU_FUND_TYPE=02"
    } else {
      $line
    }
  }
  if ($dirty) {
    Set-Content -Path $envPath -Value $new -Encoding UTF8
    $healed += "env"
    Write-Host "HEAL_ENV KABU_EXCHANGE/FUND_TYPE poison cleared"
  }
}

$learnPath = Join-Path $SetupDir "order-defaults.json"
if (Test-Path $learnPath) {
  try {
    $j = Get-Content $learnPath -Raw | ConvertFrom-Json
    $changed = $false
    if ([int]$j.exchange -eq 1) { $j.exchange = 27; $changed = $true }
    if ([string]$j.fundType -eq "AA") { $j.fundType = "02"; $changed = $true }
    if ($changed) {
      $j.updatedAt = (Get-Date).ToString("o")
      $j.healed = $true
      $j | ConvertTo-Json -Compress | Set-Content -Path $learnPath -Encoding UTF8
      $healed += "learned"
      Write-Host "HEAL_LEARNED exchange/fundType poison cleared"
    }
  } catch {
    Write-Host ("HEAL_LEARNED_SKIP " + $_.Exception.Message)
  }
}

# Clear yesterday's reject storm so a new day can retry after fixes
$stormPath = Join-Path $SetupDir "reject-storm.json"
if (Test-Path $stormPath) {
  try {
    $st = Get-Content $stormPath -Raw | ConvertFrom-Json
    $today = (Get-Date).ToString("yyyy-MM-dd")
    # Compare as JST calendar via Tokyo offset if machine is Tokyo (Ensure sets TZ)
    if ($st.day -and $st.day -ne $today) {
      Remove-Item $stormPath -Force
      $healed += "storm"
      Write-Host "HEAL_STORM cleared stale reject-storm.json day=$($st.day)"
    }
  } catch {
    Write-Host ("HEAL_STORM_SKIP " + $_.Exception.Message)
  }
}

if ($healed.Count -eq 0) {
  Write-Host "HEAL_CASH_ORDER_OK nothing"
} else {
  Write-Host ("HEAL_CASH_ORDER_OK " + ($healed -join ","))
}
exit 0
