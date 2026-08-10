param(
  [Parameter(Mandatory = $true)]
  [string]$CaddyPath,
  [string]$WinSWPath = "C:\ProgramData\EGBioMed\CancerRisk\service\EGBioMedCancerRisk.exe"
)

$ErrorActionPreference = "Stop"
$serviceName = "EGBioMedCancerRiskHttps"
$firewallRuleName = "EG BioMed Cancer Risk HTTPS (LAN only)"
$expectedCaddyHash = "5CB9AB71E5756CE72840B8234177A2F40C8B4AB47A806B8E841E2B784E9DF62B"
$expectedWinSWHash = "05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA"
$serviceRoot = "C:\ProgramData\EGBioMed\CancerRisk\https-service"
$caddyRoot = "C:\ProgramData\EGBioMed\CancerRisk\caddy"
$certificateRoot = "C:\ProgramData\EGBioMed\CancerRisk\certificates"
$logRoot = "C:\ProgramData\EGBioMed\CancerRisk\logs"
$serviceExecutable = Join-Path $serviceRoot "$serviceName.exe"
$serviceConfig = Join-Path $serviceRoot "$serviceName.xml"
$caddyExecutable = Join-Path $caddyRoot "caddy.exe"
$caddyConfig = Join-Path $caddyRoot "Caddyfile"
$serviceSource = Join-Path $PSScriptRoot "$serviceName.xml"
$caddySource = Join-Path $PSScriptRoot "Caddyfile"
$firewallSource = Join-Path $PSScriptRoot "configure-firewall.ps1"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this installer from an elevated PowerShell session."
}

foreach ($required in @($CaddyPath, $WinSWPath, $serviceSource, $caddySource, $firewallSource)) {
  if (!(Test-Path -LiteralPath $required)) {
    throw "Required file not found: $required"
  }
}
if ((Get-FileHash -LiteralPath $CaddyPath -Algorithm SHA256).Hash -ne $expectedCaddyHash) {
  throw "Caddy SHA-256 verification failed."
}
if ((Get-FileHash -LiteralPath $WinSWPath -Algorithm SHA256).Hash -ne $expectedWinSWHash) {
  throw "WinSW SHA-256 verification failed."
}

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -ne "Stopped") {
    Stop-Service -Name $serviceName -Force
    $existing.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
  }
  & $serviceExecutable uninstall
  if ($LASTEXITCODE -ne 0) {
    throw "Could not remove the previous HTTPS service configuration."
  }
}

foreach ($directory in @($serviceRoot, $caddyRoot, $certificateRoot, $logRoot)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
Copy-Item -LiteralPath $CaddyPath -Destination $caddyExecutable -Force
Copy-Item -LiteralPath $caddySource -Destination $caddyConfig -Force
Copy-Item -LiteralPath $WinSWPath -Destination $serviceExecutable -Force
Copy-Item -LiteralPath $serviceSource -Destination $serviceConfig -Force

& $caddyExecutable validate --config $caddyConfig --adapter caddyfile
if ($LASTEXITCODE -ne 0) {
  throw "Caddy configuration validation failed."
}

& $serviceExecutable install
if ($LASTEXITCODE -ne 0) {
  throw "HTTPS service installation failed."
}
Start-Service -Name $serviceName
$service = Get-Service -Name $serviceName
$service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
Set-Service -Name $serviceName -StartupType Automatic

& $firewallSource `
  -LocalAddress "192.168.12.22" `
  -RemoteAddress "192.168.12.0/24" `
  -CaddyPath $caddyExecutable | Out-Null

$rootCertificate = Join-Path $caddyRoot "data\caddy\pki\authorities\local\root.crt"
for ($attempt = 0; $attempt -lt 30 -and !(Test-Path -LiteralPath $rootCertificate); $attempt++) {
  Start-Sleep -Seconds 1
}
if (!(Test-Path -LiteralPath $rootCertificate)) {
  throw "Caddy internal CA root certificate was not generated."
}
$exportedRoot = Join-Path $certificateRoot "EG-BioMed-LAN-Root-CA.crt"
Copy-Item -LiteralPath $rootCertificate -Destination $exportedRoot -Force
$certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($exportedRoot)
$trusted = Get-ChildItem Cert:\LocalMachine\Root | Where-Object Thumbprint -eq $certificate.Thumbprint
if (!$trusted) {
  Import-Certificate -FilePath $exportedRoot -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
}

$privatePki = Join-Path $caddyRoot "data\caddy\pki"
icacls.exe $privatePki /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not apply explicit access to the existing private PKI files."
}
icacls.exe $privatePki /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not apply inherited access to the private PKI directory."
}

[pscustomobject]@{
  Name = $service.Name
  Status = $service.Status
  UrlByName = "https://DESKTOP-2LF2A4I"
  UrlByIp = "https://192.168.12.22"
  RootCertificate = $exportedRoot
  RootThumbprint = $certificate.Thumbprint
  FirewallRule = $firewallRuleName
}
