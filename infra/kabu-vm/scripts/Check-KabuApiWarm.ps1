#Requires -Version 5.1
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:18081/" -UseBasicParsing -TimeoutSec 8
  Write-Host ("KABU_HTTP=" + $r.StatusCode)
} catch {
  Write-Host ("KABU_HTTP_FAIL")
}
try {
  $r2 = Invoke-WebRequest -Uri "http://127.0.0.1:18080/" -UseBasicParsing -TimeoutSec 5
  Write-Host ("KABU_HTTP_18080=" + $r2.StatusCode)
} catch {
  Write-Host "KABU_HTTP_18080_FAIL"
}
Get-Process KabuS -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ("KabuS=" + $_.Id) }
Get-Content C:\kabu-setup\probe.log -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ("PROBE " + $_) }
Get-Content C:\kabu-setup\sync.log -Tail 10 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ("SYNC " + $_) }
Write-Host "WARM_CHECK_OK"
