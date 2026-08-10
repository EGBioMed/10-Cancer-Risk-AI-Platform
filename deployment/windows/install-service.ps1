param(
  [Parameter(Mandatory = $true)]
  [string]$WinSWPath
)

$ErrorActionPreference = "Stop"
$expectedHash = "05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA"
$serviceName = "EGBioMedCancerRisk"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$serviceSource = Join-Path $PSScriptRoot "$serviceName.xml"
$serviceRoot = "C:\ProgramData\EGBioMed\CancerRisk\service"
$logRoot = "C:\ProgramData\EGBioMed\CancerRisk\logs"
$serviceExecutable = Join-Path $serviceRoot "$serviceName.exe"
$serviceConfig = Join-Path $serviceRoot "$serviceName.xml"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this installer from an elevated PowerShell session."
}

foreach ($required in @(
  $WinSWPath,
  $serviceSource,
  (Join-Path $projectRoot "server.js"),
  (Join-Path $projectRoot "runtime\database.env"),
  (Join-Path $projectRoot "scripts\start-postgres-local.ps1"),
  "C:\Program Files\nodejs\node.exe"
)) {
  if (!(Test-Path -LiteralPath $required)) {
    throw "Required file not found: $required"
  }
}

$actualHash = (Get-FileHash -LiteralPath $WinSWPath -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) {
  throw "WinSW SHA-256 mismatch. Expected $expectedHash, received $actualHash."
}

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -ne "Stopped") {
    Stop-Service -Name $serviceName -Force
    $existing.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
  }
  & $serviceExecutable uninstall
  if ($LASTEXITCODE -ne 0) {
    throw "Could not remove the previous service configuration."
  }
}

New-Item -ItemType Directory -Path $serviceRoot -Force | Out-Null
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
Copy-Item -LiteralPath $WinSWPath -Destination $serviceExecutable -Force
Copy-Item -LiteralPath $serviceSource -Destination $serviceConfig -Force

& $serviceExecutable install
if ($LASTEXITCODE -ne 0) {
  throw "WinSW service installation failed."
}

Start-Service -Name $serviceName
$service = Get-Service -Name $serviceName
$service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
Set-Service -Name $serviceName -StartupType Automatic

[pscustomobject]@{
  Name = $service.Name
  Status = $service.Status
  StartType = $service.StartType
  Executable = $serviceExecutable
  Config = $serviceConfig
  Logs = $logRoot
}
