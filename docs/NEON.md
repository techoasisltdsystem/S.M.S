# Neon database (deployed site)

The deployed build (`npm run build`) uses **Neon**: Postgres + the Neon Data API for rows, Neon Auth (Better Auth) for sign-in.
`npm run dev` still uses the laptop database. `VITE_DB_PROVIDER=neon|local|supabase` overrides either.

- Every database and sign-in call goes through `src/lib/db.ts`. Row access is decided by the same Row-Level Security as before (`auth.uid()` is the Neon Auth user id from the token).
- `scripts/neon/migrate.mjs` runs at the start of the Vercel build. It reads the connection string Vercel injects (`STORAGE_DATABASE_URL_UNPOOLED` and similar, never committed), applies any unapplied file in `supabase/migrations`, and records the result in `local_meta.migration_log`. A failure is logged and the build continues.
- On Neon, `auth.users` is `neon_auth."user"`; the migration script rewrites that reference.
- Not available on Neon yet: second factor (TOTP), file storage (logos are stored inline), password reset email until a mail provider is set in Neon Auth.
- Neon Auth must list the site's origin under trusted domains.
