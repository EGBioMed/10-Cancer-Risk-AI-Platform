param(
  [Parameter(Mandatory = $true)]
  [string]$BackupRoot,
  [ValidateRange(1, 3650)]
  [int]$RetentionDays = 30,
  [string]$ConfigPath = "",
  [string]$NodePath = "C:\Program Files\nodejs\node.exe",
  [string]$PgDumpPath = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
  [string]$LogRoot = "C:\ProgramData\EGBioMed\CancerRisk\logs"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$ConfigPath) {
  $ConfigPath = Join-Path $projectRoot "runtime\database.env"
}
$backupScript = Join-Path $PSScriptRoot "backup-postgres.js"
$logPath = Join-Path $LogRoot "postgres-backup.log"
$statusPath = Join-Path $LogRoot "postgres-backup-status.json"
$startedAt = Get-Date

function Write-BackupLog([string]$Level, [string]$Message) {
  New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
  $line = "{0} [{1}] {2}" -f (Get-Date).ToString("o"), $Level, $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
}
function Write-BackupStatus([bool]$Succeeded, [string]$Message, [string]$Destination = "") {
  [pscustomobject]@{
    succeeded = $Succeeded
    started_at = $startedAt.ToUniversalTime().ToString("o")
    completed_at = (Get-Date).ToUniversalTime().ToString("o")
    destination = $Destination
    retention_days = $RetentionDays
    message = $Message
  } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $statusPath -Encoding utf8
}

try {
  foreach ($requiredFile in @($ConfigPath, $NodePath, $PgDumpPath, $backupScript)) {
    if (!(Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
      throw "Required backup dependency not found: $requiredFile"
    }
  }

  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
  $resolvedBackupRoot = (Resolve-Path -LiteralPath $BackupRoot).Path

  foreach ($line in Get-Content -LiteralPath $ConfigPath) {
    if ($line -match '^([^#=]+)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
  }
  [Environment]::SetEnvironmentVariable("PG_DUMP_PATH", $PgDumpPath, "Process")
  [Environment]::SetEnvironmentVariable("LOCAL_BACKUP_DIR", $resolvedBackupRoot, "Process")
  [Environment]::SetEnvironmentVariable("LOCAL_BACKUP_RETENTION_DAYS", [string]$RetentionDays, "Process")

  Write-BackupLog "INFO" "Starting PostgreSQL backup to $resolvedBackupRoot."
  $backupOutput = @(& $NodePath $backupScript 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Backup process failed: $($backupOutput -join ' ')"
  }

  $destination = Get-ChildItem -LiteralPath $resolvedBackupRoot -Directory -Filter "backup-*" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (!$destination -or $destination.LastWriteTime -lt $startedAt.AddMinutes(-1)) {
    throw "Backup process did not create a new backup directory."
  }

  $dumpPath = Join-Path $destination.FullName "cancer_risk.dump"
  $manifestPath = Join-Path $destination.FullName "manifest.json"
  if (!(Test-Path -LiteralPath $dumpPath -PathType Leaf) -or
      !(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Backup output is missing cancer_risk.dump or manifest.json."
  }
  if ((Get-Item -LiteralPath $dumpPath).Length -le 0) {
    throw "PostgreSQL dump is empty."
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $expectedHash = [string]$manifest.files.'cancer_risk.dump'
  $actualHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if (!$expectedHash -or $actualHash -ne $expectedHash.ToLowerInvariant()) {
    throw "Backup SHA-256 verification failed."
  }

  $message = "Backup completed and verified: $($destination.FullName)"
  Write-BackupLog "INFO" $message
  Write-BackupStatus $true $message $destination.FullName
  $destination.FullName
} catch {
  $safeMessage = $_.Exception.Message -replace '(?i)(password\s*[=:]\s*)\S+', '$1<redacted>'
  Write-BackupLog "ERROR" $safeMessage
  Write-BackupStatus $false $safeMessage
  throw
}
