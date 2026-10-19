# Stops PostgREST and local Postgres. Data is kept in %LOCALAPPDATA%\TechOasis\pgdata.
. "$PSScriptRoot\common.ps1"

Get-Process postgrest -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'PostgREST stopped.'

if (Test-PgRunning) {
  & "$PgBin\pg_ctl.exe" stop -D $PgData -m fast -w | Out-Null
  Write-Host 'Postgres stopped.'
} else {
  Write-Host 'Postgres was not running.'
}
