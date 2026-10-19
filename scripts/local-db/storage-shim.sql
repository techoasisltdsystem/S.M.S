-- Minimal stand-in for Supabase's storage schema so the Supabase migrations in
-- supabase/migrations apply unchanged to plain Postgres. Files are not stored
-- here locally; src/lib/db.ts keeps uploaded images inline instead.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT
);

-- Tracks which files from supabase/migrations have been applied.
CREATE SCHEMA IF NOT EXISTS local_meta;
CREATE TABLE IF NOT EXISTS local_meta.schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
