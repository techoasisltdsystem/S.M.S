# Shared paths and helpers for the local database scripts.
$ErrorActionPreference = 'Stop'

$ProjectRoot  = (Resolve-Path "$PSScriptRoot\..\..").Path
$EnvFile      = Join-Path $ProjectRoot '.env.local'
$ToolsRoot    = Join-Path $env:LOCALAPPDATA 'TechOasis'
$PgBin        = Join-Path $ToolsRoot 'pgsql\bin'
$PgData       = Join-Path $ToolsRoot 'pgdata'
$PgLog        = Join-Path $ToolsRoot 'postgres.log'
$PostgrestExe = Join-Path $ToolsRoot 'postgrest\postgrest.exe'
$PostgrestLog = Join-Path $ToolsRoot 'postgrest.log'
$PgPort       = 5432
$ApiPort      = 3001

function Read-EnvFile {
  $vars = @{}
  if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
      if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $vars[$Matches[1]] = $Matches[2].Trim() }
    }
  }
  return $vars
}

function New-Secret([int]$Length = 32) {
  $chars = [char[]]'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  $bytes = New-Object byte[] $Length
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

# Runs psql against a connection URL without echoing the password.
function Invoke-Psql([string]$Url, [string[]]$PsqlArgs) {
  & "$PgBin\psql.exe" -X -q -v ON_ERROR_STOP=1 -d $Url @PsqlArgs
  if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE)" }
}

function Test-PgRunning {
  & "$PgBin\pg_ctl.exe" status -D $PgData *> $null
  return $LASTEXITCODE -eq 0
}

function Start-Pg {
  if (Test-PgRunning) { Write-Host 'Postgres already running.'; return }
  # Launched detached: postgres inherits pg_ctl's handles, so a piped pg_ctl
  # would keep the caller's output open until the server stops.
  Start-Process -FilePath "$PgBin\pg_ctl.exe" -WindowStyle Hidden `
    -ArgumentList @('start', '-D', "`"$PgData`"", '-l', "`"$PgLog`"", '-o', "`"-p $PgPort`"") | Out-Null
  for ($i = 0; $i -lt 30; $i++) {
    & "$PgBin\pg_isready.exe" -q -h localhost -p $PgPort
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw "Postgres failed to start; see $PgLog" }
  Write-Host "Postgres started on localhost:$PgPort"
}
