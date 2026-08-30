#Requires -Version 5.1
param(
  [string]$Secret = "",
  [switch]$GenerateNew,
  [string]$SwaName = "swa-personal-apps-prod",
  [string]$ResourceGroup = "rg-personal-apps-prod",
  [string]$Repo = "mickey4world-rgb/AQUA",
  [string]$ProductionUrl = "https://www.aquacore.net",
  [string]$TdrPreviewUrl = "https://www.aquacore.net/tdr-preview"
)

$ErrorActionPreference = "Stop"

function Test-CliCommand([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-AzureSettingNames {
  $raw = az staticwebapp appsettings list `
    --name $SwaName `
    --resource-group $ResourceGroup `
    --query "properties" `
    --output json
  if (-not $raw) { return $null }
  return ($raw | ConvertFrom-Json)
}

function Get-AzureSettingValue([string]$key) {
  az staticwebapp appsettings list `
    --name $SwaName `
    --resource-group $ResourceGroup `
    --query "properties.$key" `
    --output tsv
}

function Set-AzureSettings([hashtable]$pairs) {
  $args = @(
    "staticwebapp", "appsettings", "set",
    "--name", $SwaName,
    "--resource-group", $ResourceGroup,
    "--setting-names"
  )
  foreach ($kv in $pairs.GetEnumerator()) {
    $args += "$($kv.Key)=$($kv.Value)"
  }
  az @args | Out-Null
}

function New-CronSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=")
}

function Test-GhSecretExists([string]$name) {
  $list = gh secret list --repo $Repo 2>$null
  return [bool]($list | Select-String -Pattern "^$name\s")
}

function Set-GhSecret([string]$name, [string]$value) {
  $value | gh secret set $name --repo $Repo
}

function Test-GhVarExists([string]$name) {
  $list = gh variable list --repo $Repo 2>$null
  return [bool]($list | Select-String -Pattern "^$name\s")
}

function Set-GhVar([string]$name, [string]$value) {
  gh variable set $name --repo $Repo --body $value | Out-Null
}

Write-Host "=== sync-soluna-env ===" -ForegroundColor Cyan

if (-not (Test-CliCommand "az")) {
  throw "Azure CLI not found. Run: az login"
}
if (-not (Test-CliCommand "gh")) {
  throw "GitHub CLI not found. Run: gh auth login"
}

az account show --output none | Out-Null
gh auth status --hostname github.com 2>$null | Out-Null

$azureProps = Get-AzureSettingNames
$azureHasCron = $false
if ($null -ne $azureProps) {
  $azureHasCron = $azureProps.PSObject.Properties.Name -contains "SOLUNA_CRON_SECRET"
}
$ghHasCron = Test-GhSecretExists "SOLUNA_CRON_SECRET"

Write-Host "Azure SOLUNA_CRON_SECRET exists: $azureHasCron"
Write-Host "GitHub SOLUNA_CRON_SECRET exists: $ghHasCron"

$cronSecret = $Secret.Trim()
if ($GenerateNew) {
  $cronSecret = New-CronSecret
  Write-Host "Generated new SOLUNA_CRON_SECRET." -ForegroundColor Yellow
}
elseif (-not $cronSecret -and $env:SOLUNA_CRON_SECRET) {
  $cronSecret = $env:SOLUNA_CRON_SECRET.Trim()
  Write-Host "Using SOLUNA_CRON_SECRET from environment."
}
elseif (-not $cronSecret -and $azureHasCron) {
  $cronSecret = (Get-AzureSettingValue "SOLUNA_CRON_SECRET").Trim()
  Write-Host "Syncing existing Azure SOLUNA_CRON_SECRET to GitHub."
}
elseif (-not $cronSecret -and -not $azureHasCron -and -not $ghHasCron) {
  $cronSecret = New-CronSecret
  Write-Host "Generated new SOLUNA_CRON_SECRET for both sides." -ForegroundColor Yellow
}
elseif (-not $cronSecret -and $ghHasCron -and -not $azureHasCron) {
  throw "GitHub has SOLUNA_CRON_SECRET but Azure does not. Set `$env:SOLUNA_CRON_SECRET and rerun, or use -GenerateNew."
}

if ($cronSecret) {
  $shouldUpdateAzure = (-not $azureHasCron) -or $GenerateNew -or $Secret -or $env:SOLUNA_CRON_SECRET
  if ($shouldUpdateAzure) {
    Set-AzureSettings @{ SOLUNA_CRON_SECRET = $cronSecret }
    Write-Host "Azure: SOLUNA_CRON_SECRET updated." -ForegroundColor Green
  }
  else {
    Write-Host "Azure: SOLUNA_CRON_SECRET unchanged."
  }

  $shouldUpdateGh = (-not $ghHasCron) -or $GenerateNew -or $Secret -or $env:SOLUNA_CRON_SECRET -or ((-not $ghHasCron) -and $azureHasCron)
  if ($shouldUpdateGh) {
    Set-GhSecret "SOLUNA_CRON_SECRET" $cronSecret
    Write-Host "GitHub: SOLUNA_CRON_SECRET updated." -ForegroundColor Green
  }
  else {
    Write-Host "GitHub: SOLUNA_CRON_SECRET unchanged."
  }
}
else {
  Write-Host "SOLUNA_CRON_SECRET already configured on both sides." -ForegroundColor Green
}

Set-AzureSettings @{ TDR_PUBLIC_PREVIEW_URL = $TdrPreviewUrl }
Write-Host "Azure: TDR_PUBLIC_PREVIEW_URL = $TdrPreviewUrl" -ForegroundColor Green

if (-not (Test-GhVarExists "PRODUCTION_URL")) {
  Set-GhVar "PRODUCTION_URL" $ProductionUrl
  Write-Host "GitHub: PRODUCTION_URL = $ProductionUrl" -ForegroundColor Green
}
else {
  Write-Host "GitHub: PRODUCTION_URL unchanged."
}

Write-Host ""
Write-Host "Done. After deploy, warm cache with:" -ForegroundColor Cyan
Write-Host "  gh workflow run disney-tdr-preview-warm.yml --repo $Repo"
