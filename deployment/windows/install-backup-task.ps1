param(
  [Parameter(Mandatory = $true)]
  [string]$BackupRoot,
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$DailyAt = "02:00",
  [ValidateRange(1, 3650)]
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"
$taskName = "EGBioMedCancerRiskDailyBackup"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\run-daily-postgres-backup.ps1"
$configPath = Join-Path $projectRoot "runtime\database.env"
$powershellPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (!$principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this scheduled-task installer from an elevated PowerShell session."
}
foreach ($required in @($runner, $configPath, $powershellPath)) {
  if (!(Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required scheduled-backup file not found: $required"
  }
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$resolvedBackupRoot = (Resolve-Path -LiteralPath $BackupRoot).Path
$probePath = Join-Path $resolvedBackupRoot ".write-test-$([guid]::NewGuid().ToString('N')).tmp"
[IO.File]::WriteAllText($probePath, "EG BioMed scheduled backup write test")
Remove-Item -LiteralPath $probePath -Force

$arguments = @(
  "-NoProfile"
  "-NonInteractive"
  "-ExecutionPolicy Bypass"
  "-File `"$runner`""
  "-BackupRoot `"$resolvedBackupRoot`""
  "-RetentionDays $RetentionDays"
) -join " "
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::FromHours(2)) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest
$task = New-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Daily PostgreSQL backup for the EG BioMed cancer-risk platform."

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

[pscustomobject]@{
  TaskName = $taskName
  BackupRoot = $resolvedBackupRoot
  DailyAt = $DailyAt
  RetentionDays = $RetentionDays
  RunAs = "SYSTEM"
  StatusLog = "C:\ProgramData\EGBioMed\CancerRisk\logs\postgres-backup-status.json"
}
