# Runs the database tests against the laptop database. Each test file runs in
# a transaction that is rolled back, so no data is left behind.
. "$PSScriptRoot\common.ps1"

$envVars = Read-EnvFile
$url = $envVars['DATABASE_URL']
if (-not $url) { throw "DATABASE_URL missing from $EnvFile - run 'npm run db:setup' first." }
Start-Pg

foreach ($f in @((Join-Path $ProjectRoot 'supabase\tests\tenant_isolation.sql'), (Join-Path $ProjectRoot 'supabase\tests\academics_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\messaging_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\results_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\audit_monitoring.sql'), (Join-Path $ProjectRoot 'supabase\tests\assignments_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\platform_console.sql'), (Join-Path $ProjectRoot 'supabase\tests\announcements_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\fees_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\billing_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\family_access.sql'), (Join-Path $ProjectRoot 'supabase\tests\platform_roles.sql'), (Join-Path $ProjectRoot 'supabase\tests\platform_ops.sql'), "$PSScriptRoot\local-auth.test.sql")) {
  Write-Host "== $(Split-Path $f -Leaf)"
  & "$PgBin\psql.exe" -X -q -v ON_ERROR_STOP=1 -d $url -f $f
  if ($LASTEXITCODE -ne 0) { throw "Tests failed in $(Split-Path $f -Leaf)" }
}
Write-Host 'All database tests passed.'
