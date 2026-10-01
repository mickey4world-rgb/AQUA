#Requires -Version 5.1
Start-Sleep -Seconds 90
Write-Host ("USER_SESSIONS:")
query user 2>&1 | ForEach-Object { Write-Host $_ }
Write-Host ("KABU_PROCS:")
Get-Process | Where-Object { $_.ProcessName -match 'Kabu|kabu|node' } | ForEach-Object {
  Write-Host ($_.ProcessName + " pid=" + $_.Id)
}
Write-Host ("STARTUP_LNK=" + (Test-Path "C:\Users\aquaadmin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\kabuStation.lnk"))
Write-Host ("DISCONNECT_BAT=" + (Test-Path "C:\kabu-setup\Disconnect-Rdp-KeepDesktop.bat"))
Get-ScheduledTask -TaskName "kabu-bridge-*" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("TASK " + $_.TaskName + " " + $_.State)
}
# probe localhost kabu if up
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:18081/" -UseBasicParsing -TimeoutSec 5
  Write-Host ("KABU_HTTP=" + $r.StatusCode)
} catch {
  Write-Host ("KABU_HTTP_FAIL=" + $_.Exception.Message)
}
Write-Host "POST_REBOOT_OK"
