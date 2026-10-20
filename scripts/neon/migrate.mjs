// Applies supabase/migrations to the Neon database during the Vercel build.
//
// The connection string comes from the environment variables the Vercel/Neon
// integration injects (never from the repository). Files already recorded in
// local_meta.schema_migrations are skipped, so running on every deploy is safe.
// Each file runs in its own transaction; the outcome is written to
// local_meta.migration_log so it can be read back without build logs.
// A failure is logged and the build continues, so the site still deploys.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', '..', 'supabase', 'migrations')

const url = [
  'STORAGE_DATABASE_URL_UNPOOLED',
  'STORAGE_POSTGRES_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
  'STORAGE_DATABASE_URL',
  'DATABASE_URL',
].map((k) => process.env[k]).find(Boolean)

if (!url) {
  console.log('[neon-migrate] no database URL in the environment; skipping')
  process.exit(0)
}

// Neon Auth owns the login table; Supabase's auth.users does not exist here.
const forNeon = (sql) => sql.replaceAll('auth.users', 'neon_auth."user"')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS local_meta;
    CREATE TABLE IF NOT EXISTS local_meta.schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS local_meta.migration_log (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), file TEXT, ok BOOLEAN, message TEXT);
  `)
  const done = new Set((await client.query('SELECT filename FROM local_meta.schema_migrations')).rows.map((r) => r.filename))
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (done.has(f)) continue
    try {
      await client.query('BEGIN')
      await client.query(forNeon(readFileSync(join(dir, f), 'utf8')))
      await client.query('INSERT INTO local_meta.schema_migrations(filename) VALUES ($1)', [f])
      await client.query('COMMIT')
      await client.query('INSERT INTO local_meta.migration_log(file, ok, message) VALUES ($1, true, $2)', [f, 'applied'])
      console.log(`[neon-migrate] applied ${f}`)
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      await client.query('INSERT INTO local_meta.migration_log(file, ok, message) VALUES ($1, false, $2)', [f, String(e.message).slice(0, 2000)]).catch(() => {})
      console.error(`[neon-migrate] FAILED ${f}: ${e.message}`)
      break
    }
  }
  await client.query("NOTIFY pgrst, 'reload schema'").catch(() => {})
} catch (e) {
  console.error('[neon-migrate] could not run:', e.message)
} finally {
  await client.end().catch(() => {})
}
