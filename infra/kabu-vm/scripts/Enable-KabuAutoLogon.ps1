#Requires -Version 5.1
<#
.SYNOPSIS
  Sysinternals Autologon を取得し、対話で Enable する（パスワードはツールが暗号化保存）。

.NOTES
  - リポジトリ／スクリプトにパスワードを書かない
  - 専用取引 VM + NSG /32（または JIT）前提のトレードオフ
  - 管理者で実行
#>
param(
  [string]$SetupDir = "C:\kabu-setup"
)

$ErrorActionPreference = "Stop"

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Error "Run elevated PowerShell as Administrator."
}

New-Item -ItemType Directory -Force -Path $SetupDir | Out-Null
$zip = Join-Path $SetupDir "AutoLogon.zip"
$exe = Join-Path $SetupDir "Autologon64.exe"
if (-not (Test-Path $exe)) {
  $alt = Join-Path $SetupDir "Autologon.exe"
  if (Test-Path $alt) { $exe = $alt }
}

if (-not (Test-Path $exe)) {
  Write-Host "==> Download Sysinternals Autologon"
  Invoke-WebRequest -Uri "https://download.sysinternals.com/files/AutoLogon.zip" `
    -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $SetupDir -Force
  if (Test-Path (Join-Path $SetupDir "Autologon64.exe")) {
    $exe = Join-Path $SetupDir "Autologon64.exe"
  } elseif (Test-Path (Join-Path $SetupDir "Autologon.exe")) {
    $exe = Join-Path $SetupDir "Autologon.exe"
  } else {
    Write-Error "Autologon.exe not found after extract under $SetupDir"
  }
}

Write-Host @"

==> Launching Autologon GUI
1. Username = この VM のローカル管理者（例: $env:USERNAME）
2. Domain   = ローカルなら マシン名（$env:COMPUTERNAME）または空欄のままツール指示どおり
3. Password = RDP と同じ（チャット・Git に書かない）
4. Enable をクリック
5. 一度再起動して、無人でデスクトップまで来ることを確認

SECURITY
- パスワードは LSA 秘密として保存される（平文 .bat より安全）
- それでもディスク盗難・AZ 管理者権限があればリスクあり → NSG / JIT 必須
- 無効化: 同じ GUI で Disable

Starting: $exe
"@

Start-Process -FilePath $exe -WorkingDirectory $SetupDir
