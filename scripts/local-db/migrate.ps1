# Applies any not-yet-applied files from supabase/migrations to the local database.
. "$PSScriptRoot\common.ps1"

$envVars = Read-EnvFile
$url = $envVars['DATABASE_URL']
if (-not $url) { throw "DATABASE_URL missing from $EnvFile - run 'npm run db:setup' first." }
Start-Pg

Invoke-Psql $url @('-f', "$PSScriptRoot\storage-shim.sql")
$applied = & "$PgBin\psql.exe" -X -q -t -A -d $url -c 'SELECT filename FROM local_meta.schema_migrations'

$migrations = Get-ChildItem (Join-Path $ProjectRoot 'supabase\migrations') -Filter *.sql | Sort-Object Name
foreach ($m in $migrations) {
  if ($applied -contains $m.Name) { continue }
  Write-Host "Applying $($m.Name)"
  Invoke-Psql $url @('-1', '-f', $m.FullName)
  Invoke-Psql $url @('-c', "INSERT INTO local_meta.schema_migrations (filename) VALUES ('$($m.Name)')")
}

# Let the PostgREST anonymous role use everything the app's RLS policies allow.
Invoke-Psql $url @('-c', @'
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO web_anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO web_anon;
NOTIFY pgrst, 'reload schema';
'@)
Write-Host 'Migrations up to date.'
