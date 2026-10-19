# Runs the database tests against the laptop database. Each test file runs in
# a transaction that is rolled back, so no data is left behind.
. "$PSScriptRoot\common.ps1"

$envVars = Read-EnvFile
$url = $envVars['DATABASE_URL']
if (-not $url) { throw "DATABASE_URL missing from $EnvFile - run 'npm run db:setup' first." }
Start-Pg

foreach ($f in @((Join-Path $ProjectRoot 'supabase\tests\tenant_isolation.sql'), "$PSScriptRoot\local-auth.test.sql")) {
  Write-Host "== $(Split-Path $f -Leaf)"
  & "$PgBin\psql.exe" -X -q -v ON_ERROR_STOP=1 -d $url -f $f
  if ($LASTEXITCODE -ne 0) { throw "Tests failed in $(Split-Path $f -Leaf)" }
}
Write-Host 'All database tests passed.'
