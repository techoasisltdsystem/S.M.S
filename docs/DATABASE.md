# Database

The school settings, profiles, roles and audit log tables are defined in `supabase/migrations/`. The app reads them through `src/integrations/supabase/client.ts`.

**Neon (free Postgres, connected through Vercel) is the temporary database we are moving to**, and we plan to move to another database later. To keep that move small:

- All database access will go through one module, so no page talks to a database driver directly.
- Queries stay plain Postgres SQL with no Neon-only features.
- The connection comes from one environment variable set in Vercel, never committed.

Until the Neon database is created and wired in, no database is configured on the deployed site. Pages that need data show an error or empty state instead of sample numbers.
