$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectRoot "runtime\database.env"
if (!(Test-Path -LiteralPath $configPath)) {
  throw "Missing runtime database configuration: $configPath"
}

foreach ($line in Get-Content -LiteralPath $configPath) {
  if ($line -match '^([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}

$nodePath = "C:\Program Files\nodejs\node.exe"
if (!(Test-Path -LiteralPath $nodePath)) {
  $nodePath = (Get-Command node -ErrorAction Stop).Source
}

Set-Location -LiteralPath $projectRoot
& $nodePath "server.js"
exit $LASTEXITCODE
