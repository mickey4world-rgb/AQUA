# Azure Automation: 平日 05:00 JST に vm-kabu-aqua を起動
#
# 適用:
#   powershell -ExecutionPolicy Bypass -File infra/kabu-vm/scripts/Deploy-WeekdayVmStart.ps1
#
# 停止は既存 Auto-shutdown 16:30 JST（deallocate）に任せる。

param(
  [string]$ResourceGroup = "rg-personal-apps-prod",
  [string]$VmName = "vm-kabu-aqua",
  [string]$Location = "japaneast",
  [string]$AutomationAccount = "aa-kabu-aqua",
  [string]$RunbookName = "Start-KabuVm",
  [string]$ScheduleName = "weekday-0500-jst-start"
)

$ErrorActionPreference = "Continue"

Write-Host "Ensuring Automation Account $AutomationAccount ..."
$existing = az automation account show -g $ResourceGroup -n $AutomationAccount -o json 2>$null
if (-not $existing) {
  az automation account create `
    -g $ResourceGroup `
    -n $AutomationAccount `
    -l $Location `
    --sku Basic `
    -o none
  if ($LASTEXITCODE -ne 0) { throw "automation account create failed" }
}

Write-Host "Enabling system-assigned identity ..."
$aaId = az automation account show -g $ResourceGroup -n $AutomationAccount --query id -o tsv
az resource update --ids $aaId --set identity.type=SystemAssigned -o none
if ($LASTEXITCODE -ne 0) { throw "failed to enable managed identity" }
Start-Sleep -Seconds 5
$principalId = az automation account show -g $ResourceGroup -n $AutomationAccount --query identity.principalId -o tsv
if (-not $principalId) { throw "Managed identity principalId missing" }
Write-Host "PrincipalId=$principalId"

$vmId = az vm show -g $ResourceGroup -n $VmName --query id -o tsv
Write-Host "Granting Virtual Machine Contributor on VM ..."
az role assignment create `
  --assignee-object-id $principalId `
  --assignee-principal-type ServicePrincipal `
  --role "Virtual Machine Contributor" `
  --scope $vmId `
  -o none 2>$null

$subId = az account show --query id -o tsv
$runbookBody = @"
param(
  [string]`$ResourceGroup = '$ResourceGroup',
  [string]`$VmName = '$VmName'
)
Disable-AzContextAutosave -Scope Process | Out-Null
Connect-AzAccount -Identity | Out-Null
Set-AzContext -SubscriptionId '$subId' | Out-Null
`$vm = Get-AzVM -ResourceGroupName `$ResourceGroup -Name `$VmName -Status
`$power = (`$vm.Statuses | Where-Object { `$_.Code -like 'PowerState/*' }).Code
Write-Output ("Power before: " + `$power)
if (`$power -eq 'PowerState/running') {
  Write-Output 'Already running — skip start'
  return
}
Start-AzVM -ResourceGroupName `$ResourceGroup -Name `$VmName
Write-Output 'Start-AzVM requested'
"@

$tmp = Join-Path $env:TEMP "$RunbookName.ps1"
Set-Content -Path $tmp -Value $runbookBody -Encoding UTF8

Write-Host "Upserting runbook $RunbookName ..."
$rb = az automation runbook show -g $ResourceGroup --automation-account-name $AutomationAccount -n $RunbookName -o json 2>$null
if (-not $rb) {
  az automation runbook create `
    -g $ResourceGroup `
    --automation-account-name $AutomationAccount `
    -n $RunbookName `
    --type PowerShell `
    -o none
}

az automation runbook replace-content `
  -g $ResourceGroup `
  --automation-account-name $AutomationAccount `
  -n $RunbookName `
  --content "@$tmp" `
  -o none

az automation runbook publish `
  -g $ResourceGroup `
  --automation-account-name $AutomationAccount `
  -n $RunbookName `
  -o none

# 次の平日 05:00 JST
$tz = [TimeZoneInfo]::FindSystemTimeZoneById("Tokyo Standard Time")
$nowLocal = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
$candidate = Get-Date -Year $nowLocal.Year -Month $nowLocal.Month -Day $nowLocal.Day -Hour 5 -Minute 0 -Second 0
if ($candidate -le $nowLocal) { $candidate = $candidate.AddDays(1) }
while ($candidate.DayOfWeek -eq "Saturday" -or $candidate.DayOfWeek -eq "Sunday") {
  $candidate = $candidate.AddDays(1)
}
$startTimeIso = $candidate.ToString("yyyy-MM-dd") + "T05:00:00+09:00"
Write-Host "Schedule startTime=$startTimeIso"

$base = "https://management.azure.com/subscriptions/$subId/resourceGroups/$ResourceGroup/providers/Microsoft.Automation/automationAccounts/$AutomationAccount"
$api = "2022-08-08"
$schFile = Join-Path $env:TEMP "aa-sch.json"
$jsFile = Join-Path $env:TEMP "aa-js.json"

@{
  name = $ScheduleName
  properties = @{
    description = "Weekday 05:00 JST start for $VmName"
    startTime = $startTimeIso
    frequency = "Week"
    interval = 1
    timeZone = "Tokyo Standard Time"
    advancedSchedule = @{
      weekDays = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
    }
  }
} | ConvertTo-Json -Depth 6 | Set-Content $schFile -Encoding utf8

az rest --method put `
  --url "$base/schedules/${ScheduleName}?api-version=$api" `
  --body "@$schFile" `
  --headers "Content-Type=application/json" `
  -o none
if ($LASTEXITCODE -ne 0) { throw "schedule put failed" }

# 既存 jobSchedule を掃除して張り直し
$existingJs = az rest --method get --url "$base/jobSchedules?api-version=$api" -o json 2>$null | ConvertFrom-Json
foreach ($item in @($existingJs.value)) {
  if ($item.properties.schedule.name -eq $ScheduleName) {
    $oldId = $item.properties.jobScheduleId
    if ($oldId) {
      az rest --method delete --url "$base/jobSchedules/${oldId}?api-version=$api" -o none 2>$null
    }
  }
}

$jsId = [guid]::NewGuid().ToString()
@{
  properties = @{
    schedule = @{ name = $ScheduleName }
    runbook = @{ name = $RunbookName }
  }
} | ConvertTo-Json -Depth 5 | Set-Content $jsFile -Encoding utf8

az rest --method put `
  --url "$base/jobSchedules/${jsId}?api-version=$api" `
  --body "@$jsFile" `
  --headers "Content-Type=application/json" `
  -o none
if ($LASTEXITCODE -ne 0) { throw "jobSchedule put failed" }

Write-Host ""
Write-Host "DONE: weekday 05:00 JST start → $VmName"
Write-Host "Stop remains Auto-shutdown 16:30 JST (deallocate)."
Write-Host "nextRun should show the next weekday 05:00 Asia/Tokyo."
