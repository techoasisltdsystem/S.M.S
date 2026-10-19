// Single entry point for all database access in the app.
// Pages and hooks import from "@/lib/db" — never from a provider SDK directly —
// so the backing database can be swapped by changing only this file.
//
// VITE_DB_PROVIDER selects the backend:
//   "supabase" (default) — hosted Supabase project (used by the Vercel demo)
//   "local"              — local Postgres served by PostgREST, proxied by Vite
//                          at /rest/v1 (see scripts/local-db/README.md)
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

export type DbProvider = 'supabase' | 'local'

export const dbProvider: DbProvider =
  import.meta.env.VITE_DB_PROVIDER === 'local' ? 'local' : 'supabase'

const createDb = () => {
  if (dbProvider === 'local') {
    // PostgREST speaks the same REST dialect as supabase-js' query builder.
    // The key is a placeholder; the dev proxy strips auth headers.
    return createClient<Database>(window.location.origin, 'local-dev', {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return createClient<Database>(
    // Placeholders keep the app loading when no database is configured (e.g. the Vercel demo);
    // requests then fail and each page shows its own error or empty state.
    import.meta.env.VITE_SUPABASE_URL || 'https://not-configured.invalid',
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'not-configured',
    {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  )
}

export const db = createDb()

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// Uploads a school asset (logo, banner) and returns a URL the UI can display.
export const uploadSchoolAsset = async (file: File, name: string): Promise<string> => {
  // No object storage locally: store the image inline as a data URL.
  if (dbProvider === 'local') return readAsDataUrl(file)

  const ext = file.name.split('.').pop()
  const path = `${name}-${Date.now()}.${ext}`
  const { error } = await db.storage.from('school-assets').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = db.storage.from('school-assets').getPublicUrl(path)
  return data.publicUrl
}
