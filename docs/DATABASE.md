# Database

The app still stores its data in the browser (`assets/js/core/db.js`). The server backend is being added on **Neon** (free Postgres connected through Vercel).

**Neon is temporary.** We plan to move to another database later, so the backend is built to make that move small:

- Every database call goes through one module, `api/_lib/db.js`. No other file opens a connection or imports a database driver.
- Queries are plain Postgres SQL with no Neon-only features, so any Postgres host (Supabase, RDS, a VPS) can take over.
- The connection comes from a single `DATABASE_URL` environment variable set in Vercel. It is never committed.
- The schema lives in `db/schema.sql` and later migration files in `db/migrations/`, applied at deploy.

To move: export the data from Neon (`pg_dump`), load it into the new database, then point `DATABASE_URL` at it. If the new database is not Postgres, only `api/_lib/db.js` changes.
