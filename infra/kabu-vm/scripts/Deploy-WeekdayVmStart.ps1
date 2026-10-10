# Azure Automation: 東証現物の営業日朝だけ vm-kabu-aqua を起動
#
# 適用:
#   powershell -ExecutionPolicy Bypass -File infra/kabu-vm/scripts/Deploy-WeekdayVmStart.ps1
#   # 既定 07:00 JST（勤務先から遠隔 OTP する前提。旧 05:00 は無効化すること）
#
# スケジュールは月〜金だが、ランブック内で祝日・年末年始は Start しない
# （例: 2026-10-12 スポーツの日 = 現物休場）。
#
# 停止は既存 Auto-shutdown 16:00 JST（deallocate）に任せる。
# ※ 起動時刻を遅らせても「緑なのに sync 不可」は直らない。OTP後 wait-ready / 再起動が本丸。

param(
  [string]$ResourceGroup = "rg-personal-apps-prod",
  [string]$VmName = "vm-kabu-aqua",
  [string]$Location = "japaneast",
  [string]$AutomationAccount = "aa-kabu-aqua",
  [string]$RunbookName = "Start-KabuVm",
  [int]$StartHour = 7,
  [int]$StartMinute = 0,
  [string]$ScheduleName = ""
)
if (-not $ScheduleName) {
  $ScheduleName = ("weekday-{0:d2}{1:d2}-jst-start" -f $StartHour, $StartMinute)
}

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
# Keep in sync with frontend/lib/stock-jp-holidays.ts (TSE cash closed)
$runbookBody = @"
param(
  [string]`$ResourceGroup = '$ResourceGroup',
  [string]`$VmName = '$VmName'
)
Disable-AzContextAutosave -Scope Process | Out-Null
Connect-AzAccount -Identity | Out-Null
Set-AzContext -SubscriptionId '$subId' | Out-Null

`$tz = [TimeZoneInfo]::FindSystemTimeZoneById('Tokyo Standard Time')
`$jst = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, `$tz)
`$dayKey = `$jst.ToString('yyyy-MM-dd')
`$holidays = [System.Collections.Generic.HashSet[string]]::new()
@(
  '2026-01-01','2026-01-02','2026-01-12','2026-02-11','2026-02-23','2026-03-20',
  '2026-04-29','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11',
  '2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23','2026-12-31',
  '2027-01-01','2027-01-02','2027-01-03','2027-01-11','2027-02-11','2027-02-23',
  '2027-03-21','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05',
  '2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03',
  '2027-11-23','2027-12-31'
) | ForEach-Object { [void]`$holidays.Add(`$_) }

if (`$jst.DayOfWeek -eq 'Saturday' -or `$jst.DayOfWeek -eq 'Sunday') {
  Write-Output ("SKIP weekend JST=" + `$dayKey)
  return
}
if (`$holidays.Contains(`$dayKey)) {
  Write-Output ("SKIP TSE holiday JST=" + `$dayKey + " (cash equities closed; no kabu VM start)")
  return
}

`$vm = Get-AzVM -ResourceGroupName `$ResourceGroup -Name `$VmName -Status
`$power = (`$vm.Statuses | Where-Object { `$_.Code -like 'PowerState/*' }).Code
Write-Output ("Power before: " + `$power)
if (`$power -eq 'PowerState/running') {
  Write-Output 'Already running - skip start'
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

# 次の東証営業日 StartHour:StartMinute JST（土日祝スキップ）
$holidaySet = [System.Collections.Generic.HashSet[string]]::new()
@(
  "2026-01-01","2026-01-02","2026-01-12","2026-02-11","2026-02-23","2026-03-20",
  "2026-04-29","2026-05-04","2026-05-05","2026-05-06","2026-07-20","2026-08-11",
  "2026-09-21","2026-09-22","2026-09-23","2026-10-12","2026-11-03","2026-11-23","2026-12-31",
  "2027-01-01","2027-01-02","2027-01-03","2027-01-11","2027-02-11","2027-02-23",
  "2027-03-21","2027-03-22","2027-04-29","2027-05-03","2027-05-04","2027-05-05",
  "2027-07-19","2027-08-11","2027-09-20","2027-09-23","2027-10-11","2027-11-03",
  "2027-11-23","2027-12-31"
) | ForEach-Object { [void]$holidaySet.Add($_) }

$tz = [TimeZoneInfo]::FindSystemTimeZoneById("Tokyo Standard Time")
$nowLocal = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
$candidate = Get-Date -Year $nowLocal.Year -Month $nowLocal.Month -Day $nowLocal.Day `
  -Hour $StartHour -Minute $StartMinute -Second 0
if ($candidate -le $nowLocal) { $candidate = $candidate.AddDays(1) }
while (
  $candidate.DayOfWeek -eq "Saturday" -or
  $candidate.DayOfWeek -eq "Sunday" -or
  $holidaySet.Contains($candidate.ToString("yyyy-MM-dd"))
) {
  $candidate = $candidate.AddDays(1)
}
$startTimeIso = $candidate.ToString("yyyy-MM-dd") + ("T{0:d2}:{1:d2}:00+09:00" -f $StartHour, $StartMinute)
Write-Host "Schedule startTime=$startTimeIso name=$ScheduleName (next TSE cash session)"

$base = "https://management.azure.com/subscriptions/$subId/resourceGroups/$ResourceGroup/providers/Microsoft.Automation/automationAccounts/$AutomationAccount"
$api = "2022-08-08"
$schFile = Join-Path $env:TEMP "aa-sch.json"
$jsFile = Join-Path $env:TEMP "aa-js.json"

$desc = "TSE cash session {0:d2}:{1:d2} JST start for $VmName (skips JP holidays in runbook)" -f $StartHour, $StartMinute
@{
  name = $ScheduleName
  properties = @{
    description = $desc
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
Write-Host ("DONE: TSE-session {0:d2}:{1:d2} JST start -> {2}" -f $StartHour, $StartMinute, $VmName)
Write-Host "Stop remains Auto-shutdown 16:00 JST (deallocate)."
Write-Host ("Schedule still Mon-Fri, but runbook SKIPS JP equity holidays (e.g. 2026-10-12 Sports Day).")
Write-Host ("Displayed next cash session start anchor: {0}" -f $startTimeIso)
# Disable old schedules so the VM does not double-start
$disableFile = Join-Path $env:TEMP "aa-sch-disable.json"
'{"properties":{"isEnabled":false}}' | Set-Content $disableFile -Encoding utf8
foreach ($oldName in @("weekday-0500-jst-start", "weekday-0630-jst-start")) {
  if ($oldName -eq $ScheduleName) { continue }
  Write-Host "Disabling old schedule if present: $oldName"
  az rest --method patch `
    --url "$base/schedules/${oldName}?api-version=$api" `
    --body "@$disableFile" `
    --headers "Content-Type=application/json" `
    -o none 2>$null
}
Write-Host "Tried to disable old 05:00/06:30 schedules (ignore if missing)."
