# Creates a platform (Tech Oasis) super admin login on the laptop database.
# The password is typed hidden and only its bcrypt hash is stored.
. "$PSScriptRoot\common.ps1"

$envVars = Read-EnvFile
$url = $envVars['DATABASE_URL']
if (-not $url) { throw "DATABASE_URL missing from $EnvFile - run 'npm run db:setup' first." }
Start-Pg

$email = Read-Host 'Super admin email'
$secure = Read-Host 'Password (at least 12 characters)' -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($password.Length -lt 12) { throw 'Use at least 12 characters for the password.' }

$env:TOSMS_ADMIN_EMAIL = $email; $env:TOSMS_ADMIN_PASSWORD = $password
try {
  $sql = @'
\getenv e TOSMS_ADMIN_EMAIL
\getenv p TOSMS_ADMIN_PASSWORD
SELECT auth_local.create_platform_admin(:'e', :'p');
'@
  $sql | & "$PgBin\psql.exe" -X -q -t -A -v ON_ERROR_STOP=1 -d $url | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Creating the super admin failed (does the email already have a login with another password?).' }
} finally {
  Remove-Item Env:TOSMS_ADMIN_EMAIL, Env:TOSMS_ADMIN_PASSWORD
}
Write-Host "Super admin ready. Sign in at http://localhost:8080/admin with $email; you will land on the platform console."
