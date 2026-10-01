#Requires -Version 5.1
# List JP watch buy/sell candidates via AQUA intents (no secrets printed).
$ErrorActionPreference = "Stop"
$envPath = "C:\kabu-bridge\.env"
$map = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $p = $_ -split '=', 2
  if ($p.Count -eq 2) { $map[$p[0].Trim()] = $p[1].Trim() }
}
$base = $map["AQUA_BRIDGE_URL"].TrimEnd("/")
$secret = $map["AQUA_BRIDGE_SECRET"]
$userId = $map["AQUA_USER_ID"]
$url = "$base/api/stocks/broker/intents?userId=$([uri]::EscapeDataString($userId))"
$headers = @{ Authorization = "Bearer $secret" }
try {
  $res = Invoke-RestMethod -Uri $url -Headers $headers -Method GET -TimeoutSec 90
} catch {
  Write-Host ("INTENTS_FAIL " + $_.Exception.Message)
  throw
}
Write-Host ("SESSION_OPEN=" + $res.sessionOpenGuess)
Write-Host ("INTENT_COUNT=" + @($res.intents).Count)
foreach ($i in @($res.intents)) {
  Write-Host ("INTENT side=$($i.side) symbol=$($i.symbol) qty=$($i.qty) name=$($i.symbolName) rules=$($i.ruleIds -join '+') reason=$($i.reason)")
}
# Also list JP watches via public? skip - intents enough
Write-Host "CANDIDATES_OK"
