#Requires -Version 5.1
# ASCII-only. Dump tick/sync evidence for today.
$ErrorActionPreference = "Continue"
Write-Host "DIAG_START"
Write-Host ("NOW=" + (Get-Date).ToString("o"))

Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  $task = $_
  $i = $task | Get-ScheduledTaskInfo
  Write-Host (
    "TASK name=" + $task.TaskName +
    " state=" + $task.State +
    " user=" + $task.Principal.UserId +
    " last=" + $i.LastRunTime +
    " next=" + $i.NextRunTime +
    " result=" + $i.LastTaskResult
  )
}

$sn = "C:\kabu-setup\Sync-Now.cmd"
Write-Host "-- Sync-Now.cmd --"
if (Test-Path $sn) {
  $hits = Select-String -Path $sn -Pattern "more|pause" -SimpleMatch:$false
  if ($hits) {
    $hits | ForEach-Object { Write-Host ("SYNCNOW_HIT: " + $_.Line.Trim()) }
  } else {
    Write-Host "SYNCNOW_NO_MORE"
  }
} else {
  Write-Host "SYNCNOW_MISSING"
}

foreach ($pair in @(
  @{ Name = "market-tick.log"; Path = "C:\kabu-setup\market-tick.log"; Tail = 80 },
  @{ Name = "manual-sync.log"; Path = "C:\kabu-setup\manual-sync.log"; Tail = 40 },
  @{ Name = "api-recover.log"; Path = "C:\kabu-setup\api-recover.log"; Tail = 30 },
  @{ Name = "last-aqua-sync.ok"; Path = "C:\kabu-setup\last-aqua-sync.ok"; Tail = 5 },
  @{ Name = "console-keepalive.log"; Path = "C:\kabu-setup\console-keepalive.log"; Tail = 15 }
)) {
  Write-Host ("-- " + $pair.Name + " --")
  if (Test-Path $pair.Path) {
    $item = Get-Item $pair.Path
    Write-Host ("mtime=" + $item.LastWriteTime.ToString("o") + " size=" + $item.Length)
    Get-Content $pair.Path -Tail $pair.Tail -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Host $_
    }
  } else {
    Write-Host "missing"
  }
}

Write-Host "DIAG_END"
