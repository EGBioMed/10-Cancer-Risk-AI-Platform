param(
  [string]$LocalAddress = "192.168.12.22",
  [string]$RemoteAddress = "192.168.12.0/24",
  [string]$CaddyPath = "C:\ProgramData\EGBioMed\CancerRisk\caddy\caddy.exe"
)

$ErrorActionPreference = "Stop"
$httpsRuleName = "EG BioMed Cancer Risk HTTPS (LAN only)"
$postgresBlockRuleName = "EG BioMed Block PostgreSQL 5432"

function Convert-IPv4CidrToFirewallAddress([string]$Address) {
  if ($Address -notmatch '^([^/]+)/(\d{1,2})$') {
    return $Address
  }
  $network = $matches[1]
  $prefix = [int]$matches[2]
  if ($prefix -lt 0 -or $prefix -gt 32) {
    throw "Invalid IPv4 CIDR prefix: $Address"
  }
  $mask = for ($index = 0; $index -lt 4; $index++) {
    $bits = [Math]::Min(8, [Math]::Max(0, $prefix - ($index * 8)))
    if ($bits -eq 0) { 0 } else { 256 - [Math]::Pow(2, 8 - $bits) }
  }
  return "$network/$($mask -join '.')"
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this firewall configuration from an elevated PowerShell session."
}
if (!(Test-Path -LiteralPath $CaddyPath)) {
  throw "Caddy executable not found: $CaddyPath"
}
if (!(Get-NetIPAddress -IPAddress $LocalAddress -ErrorAction SilentlyContinue)) {
  throw "The configured HTTPS address is not assigned to this computer: $LocalAddress"
}

Get-NetFirewallRule -DisplayName $httpsRuleName -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule
New-NetFirewallRule `
  -DisplayName $httpsRuleName `
  -Direction Inbound `
  -Action Allow `
  -Enabled True `
  -Profile Any `
  -Protocol TCP `
  -LocalAddress $LocalAddress `
  -LocalPort 443 `
  -RemoteAddress $RemoteAddress `
  -Program $CaddyPath `
  -EdgeTraversalPolicy Block | Out-Null

# A block rule takes precedence over any accidentally retained allow rule. Loopback
# access is verified after applying this rule because the application still needs
# to connect to PostgreSQL through 127.0.0.1:5432.
Get-NetFirewallRule -DisplayName $postgresBlockRuleName -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule
New-NetFirewallRule `
  -DisplayName $postgresBlockRuleName `
  -Direction Inbound `
  -Action Block `
  -Enabled True `
  -Profile Any `
  -Protocol TCP `
  -LocalPort 5432 `
  -RemoteAddress Any `
  -EdgeTraversalPolicy Block | Out-Null

# Disable explicit PostgreSQL allow rules for hygiene. Unrelated Windows rules are
# left untouched; the block rule above is the authoritative 5432 control.
$disabledAllowRules = @()
$allowRules = Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True
foreach ($rule in $allowRules) {
  $portFilters = @($rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue)
  $applicationFilters = @($rule | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue)
  $allowsPostgresPort = $portFilters | Where-Object {
    $_.Protocol -eq "TCP" -and @($_.LocalPort) -contains "5432"
  }
  $allowsPostgresProgram = $applicationFilters | Where-Object {
    $_.Program -and $_.Program -ne "Any" -and $_.Program -match '(?i)(^|\\)postgres\.exe$'
  }
  if ($allowsPostgresPort -or $allowsPostgresProgram) {
    Disable-NetFirewallRule -Name $rule.Name
    $disabledAllowRules += $rule.DisplayName
  }
}

$httpsRule = Get-NetFirewallRule -DisplayName $httpsRuleName
$httpsPort = $httpsRule | Get-NetFirewallPortFilter
$httpsAddress = $httpsRule | Get-NetFirewallAddressFilter
$httpsApplication = $httpsRule | Get-NetFirewallApplicationFilter
$postgresBlockRule = Get-NetFirewallRule -DisplayName $postgresBlockRuleName
$postgresBlockPort = $postgresBlockRule | Get-NetFirewallPortFilter

$httpsVerification = [pscustomobject]@{
  Enabled = [string]$httpsRule.Enabled
  Action = [string]$httpsRule.Action
  Protocol = [string]$httpsPort.Protocol
  LocalPort = [string]$httpsPort.LocalPort
  LocalAddress = @($httpsAddress.LocalAddress)
  RemoteAddress = @($httpsAddress.RemoteAddress)
  Program = [string]$httpsApplication.Program
}
$httpsVerified = @("True", "1") -contains $httpsVerification.Enabled
$httpsVerified = $httpsVerified -and $httpsVerification.Action -in @("Allow", "2")
$httpsVerified = $httpsVerified -and $httpsVerification.Protocol -in @("TCP", "6")
$httpsVerified = $httpsVerified -and $httpsVerification.LocalPort -eq "443"
$httpsVerified = $httpsVerified -and $httpsVerification.LocalAddress -contains $LocalAddress
$expectedRemoteAddresses = @($RemoteAddress, (Convert-IPv4CidrToFirewallAddress $RemoteAddress))
$httpsVerified = $httpsVerified -and @($httpsVerification.RemoteAddress | Where-Object {
  $expectedRemoteAddresses -contains $_
}).Count -gt 0
$httpsVerified = $httpsVerified -and $httpsVerification.Program -ieq $CaddyPath
if (!$httpsVerified) {
  throw "HTTPS firewall rule verification failed: $($httpsVerification | ConvertTo-Json -Compress)"
}

$postgresVerification = [pscustomobject]@{
  Enabled = [string]$postgresBlockRule.Enabled
  Action = [string]$postgresBlockRule.Action
  Protocol = [string]$postgresBlockPort.Protocol
  LocalPort = [string]$postgresBlockPort.LocalPort
}
$postgresVerified = @("True", "1") -contains $postgresVerification.Enabled
$postgresVerified = $postgresVerified -and $postgresVerification.Action -in @("Block", "4")
$postgresVerified = $postgresVerified -and $postgresVerification.Protocol -in @("TCP", "6")
$postgresVerified = $postgresVerified -and $postgresVerification.LocalPort -eq "5432"
if (!$postgresVerified) {
  throw "PostgreSQL firewall block rule verification failed: $($postgresVerification | ConvertTo-Json -Compress)"
}

[pscustomobject]@{
  HttpsRule = $httpsRuleName
  HttpsLocalAddress = $httpsAddress.LocalAddress
  HttpsRemoteAddress = $httpsAddress.RemoteAddress
  HttpsPort = $httpsPort.LocalPort
  PostgreSqlBlockRule = $postgresBlockRuleName
  PostgreSqlBlockedPort = $postgresBlockPort.LocalPort
  DisabledPostgreSqlAllowRules = @($disabledAllowRules)
}
