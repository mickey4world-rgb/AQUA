#Requires -Version 5.1
<#
.SYNOPSIS
  Install Tailscale on the kabu VM for phone GUI login (OTP / passcode).
  Does NOT open Internet RDP or kabu API ports. Overlay/private path only.

.NOTES
  Set TAILSCALE_AUTHKEY in the environment for unattended join, or run
  `tailscale up` interactively after install.
  See docs/STOCK_KABU_PHONE_LOGIN.md
#>
param(
  [string]$Hostname = "vm-kabu-aqua",
  [string]$AuthKey = $env:TAILSCALE_AUTHKEY
)

$ErrorActionPreference = "Stop"

Write-Host "==> Tailscale for phone kabu login (no public RDP)"

$tailscale = Get-Command tailscale.exe -ErrorAction SilentlyContinue
if (-not $tailscale) {
  $msiUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi"
  $msi = Join-Path $env:TEMP "tailscale-setup.msi"
  Write-Host "==> Downloading Tailscale MSI"
  Invoke-WebRequest -Uri $msiUrl -OutFile $msi -UseBasicParsing
  Write-Host "==> Installing"
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait -PassThru
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
    throw "msiexec exit $($p.ExitCode)"
  }
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [System.Environment]::GetEnvironmentVariable("Path", "User")
  $tailscale = Get-Command tailscale.exe -ErrorAction SilentlyContinue
  if (-not $tailscale) {
    throw "tailscale.exe not found after install — open a new shell and re-run"
  }
}

# Ensure RDP is available on the private/overlay path only (NSG still denies Internet:3389)
Write-Host "==> Ensure Remote Desktop enabled (private path; NSG must keep Deny Internet RDP)"
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server" -Name "fDenyTSConnections" -Value 0
Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue

if ($AuthKey -and $AuthKey.Trim().Length -gt 0) {
  Write-Host "==> tailscale up (auth-key, hostname=$Hostname)"
  & tailscale.exe up --auth-key=$AuthKey --hostname=$Hostname --accept-dns=true --unattended
} else {
  Write-Host "==> No TAILSCALE_AUTHKEY — run interactively:"
  Write-Host ("    tailscale up --hostname={0} --accept-dns=true --unattended" -f $Hostname)
}

Write-Host "==> status"
& tailscale.exe status
Write-Host ""
Write-Host "NEXT:"
Write-Host "  1) Phone: Tailscale app + Windows App → connect to $Hostname"
Write-Host "  2) Enter kabu station OTP/passcode until API icon is green"
Write-Host "  3) Phone browser: https://www.aquacore.net/costs/kabu-check → confirm 緑"
Write-Host "SECURITY: Do not add NSG Allow RDP from Internet. Keep Deny-KabuApi-Internet."
