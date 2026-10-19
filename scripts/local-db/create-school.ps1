# Creates a school on the laptop database with its first administrator login.
# Asks for the details; the password is typed hidden and never stored in plain text.
. "$PSScriptRoot\common.ps1"

$envVars = Read-EnvFile
$url = $envVars['DATABASE_URL']
if (-not $url) { throw "DATABASE_URL missing from $EnvFile - run 'npm run db:setup' first." }
Start-Pg

$name = Read-Host 'School name'
$slug = (($name.ToLower() -replace '[^a-z0-9]+', '-').Trim('-'))
$adminName = Read-Host 'Administrator full name'
$adminEmail = Read-Host 'Administrator email'
$secure = Read-Host 'Administrator password (at least 8 characters)' -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($password.Length -lt 8) { throw 'Use at least 8 characters for the password.' }

# Values go in through the environment and psql variables, not the command line.
$env:TOSMS_SCHOOL = $name; $env:TOSMS_SLUG = $slug
$env:TOSMS_ADMIN_NAME = $adminName; $env:TOSMS_ADMIN_EMAIL = $adminEmail; $env:TOSMS_ADMIN_PASSWORD = $password
try {
  $sql = @'
\getenv s TOSMS_SCHOOL
\getenv g TOSMS_SLUG
\getenv n TOSMS_ADMIN_NAME
\getenv e TOSMS_ADMIN_EMAIL
\getenv p TOSMS_ADMIN_PASSWORD
SELECT auth_local.create_school(:'s', :'g', :'n', :'e', :'p');
'@
  $sql | & "$PgBin\psql.exe" -X -q -t -A -v ON_ERROR_STOP=1 -d $url | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Creating the school failed (is the slug or email already used?).' }
} finally {
  Remove-Item Env:TOSMS_SCHOOL, Env:TOSMS_SLUG, Env:TOSMS_ADMIN_NAME, Env:TOSMS_ADMIN_EMAIL, Env:TOSMS_ADMIN_PASSWORD
}
Write-Host "Created '$name'. Sign in at http://localhost:8080/admin with $adminEmail."
