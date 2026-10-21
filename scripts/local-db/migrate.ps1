# Applies any not-yet-applied files from supabase/migrations to the local database.
. "$PSScriptRoot\common.ps1"

$envVars = Read-EnvFile
$url = $envVars['DATABASE_URL']
if (-not $url) { throw "DATABASE_URL missing from $EnvFile - run 'npm run db:setup' first." }
Start-Pg

$roles = & "$PgBin\psql.exe" -X -q -t -A -d $url -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')"
if ($roles -ne '2') { throw "Database roles for sign-in are missing - run 'npm run db:setup' once (safe to re-run)." }

Invoke-Psql $url @('-f', "$PSScriptRoot\storage-shim.sql", '-f', "$PSScriptRoot\auth-shim.sql")
# Like Supabase: tables created by later migrations are reachable by signed-in
# users, and Row-Level Security in each migration decides which rows.
Invoke-Psql $url @('-c', 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO authenticated')
$applied = & "$PgBin\psql.exe" -X -q -t -A -d $url -c 'SELECT filename FROM local_meta.schema_migrations'

$migrations = Get-ChildItem (Join-Path $ProjectRoot 'supabase\migrations') -Filter *.sql | Sort-Object Name
foreach ($m in $migrations) {
  if ($applied -contains $m.Name) { continue }
  Write-Host "Applying $($m.Name)"
  Invoke-Psql $url @('-1', '-f', $m.FullName)
  Invoke-Psql $url @('-c', "INSERT INTO local_meta.schema_migrations (filename) VALUES ('$($m.Name)')")
}

# Sign-in for the laptop: the JWT secret is shared with PostgREST (start.ps1)
# and passed through the environment so it never appears on a command line.
$env:LOCAL_JWT_SECRET = Get-OrAddEnvSecret 'LOCAL_JWT_SECRET'
try {
  Invoke-Psql $url @('-c', '\getenv jwt_secret LOCAL_JWT_SECRET', '-f', "$PSScriptRoot\local-auth.sql")
  Invoke-Psql $url @('-f', "$PSScriptRoot\login-management.sql")
} finally {
  Remove-Item Env:LOCAL_JWT_SECRET
}

# The old open-access role is no longer used by PostgREST.
Invoke-Psql $url @('-c', @'
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM web_anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM web_anon;
NOTIFY pgrst, 'reload schema';
'@)
Write-Host 'Migrations up to date.'
