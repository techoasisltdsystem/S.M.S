# Starts local Postgres and the PostgREST API the app talks to in local mode.
. "$PSScriptRoot\common.ps1"

$envVars = Read-EnvFile
if (-not $envVars['DATABASE_URL']) { throw "DATABASE_URL missing from $EnvFile - run 'npm run db:setup' first." }

Start-Pg

if (Get-Process postgrest -ErrorAction SilentlyContinue) {
  Write-Host 'PostgREST already running.'
} else {
  # Configured through environment variables so the password stays in .env.local only.
  $env:PGRST_DB_URI = $envVars['DATABASE_URL']
  $env:PGRST_DB_SCHEMAS = 'public'
  $env:PGRST_DB_ANON_ROLE = 'anon'
  $env:PGRST_JWT_SECRET = Get-OrAddEnvSecret 'LOCAL_JWT_SECRET'
  $env:PGRST_DB_PRE_REQUEST = 'auth_local.check_request'
  $env:PGRST_SERVER_HOST = '127.0.0.1'
  $env:PGRST_SERVER_PORT = "$ApiPort"
  $env:PATH = "$PgBin;$env:PATH"  # postgrest.exe loads libpq.dll from here
  # Detached via a hidden shell so it never holds the caller's output pipe open.
  Start-Process -FilePath powershell.exe -WindowStyle Hidden `
    -ArgumentList @('-NoProfile', '-Command', "& '$PostgrestExe' *> '$PostgrestLog'") | Out-Null
  Remove-Item Env:PGRST_DB_URI, Env:PGRST_JWT_SECRET
  Start-Sleep -Seconds 2
  if (-not (Get-Process postgrest -ErrorAction SilentlyContinue)) { throw "PostgREST failed to start; see $PostgrestLog" }
  Write-Host "PostgREST API started on 127.0.0.1:$ApiPort"
}
