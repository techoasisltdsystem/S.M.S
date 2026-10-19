// Single entry point for all database and sign-in access in the app.
// Pages and hooks import from "@/lib/db" — never from a provider SDK directly —
// so the backing database can be swapped by changing only this file.
//
// VITE_DB_PROVIDER selects the backend:
//   "local" (default)    — local Postgres served by PostgREST, proxied by Vite
//                          at /rest/v1; sign-in is checked in the database by
//                          scripts/local-db/local-auth.sql
//   "supabase"           — hosted Supabase project: Supabase Auth for sign-in
//
// Either way the browser only holds a signed session token. Which school a
// user belongs to, their role and their permissions are decided by the
// database (Row-Level Security), never by values sent from here.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

export type DbProvider = 'supabase' | 'local'

// The laptop database is the default. Set VITE_DB_PROVIDER=supabase only if a hosted project is added later.
export const dbProvider: DbProvider =
  import.meta.env.VITE_DB_PROVIDER === 'supabase' ? 'supabase' : 'local'

const LOCAL_SESSION_KEY = 'tosms.local.session'

interface LocalSession {
  access_token: string
  expires_at: string
  user: { id: string; email: string }
}

// The local token lives in sessionStorage so it ends with the browser tab.
const readLocalSession = (): LocalSession | null => {
  try {
    const raw = sessionStorage.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as LocalSession
    if (new Date(s.expires_at).getTime() <= Date.now()) {
      sessionStorage.removeItem(LOCAL_SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

const writeLocalSession = (s: LocalSession | null) => {
  try {
    if (s) sessionStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(LOCAL_SESSION_KEY)
  } catch {
    // Storage blocked: the session lasts until the page reloads.
  }
}

const createDb = () => {
  if (dbProvider === 'local') {
    // PostgREST speaks the same REST dialect as supabase-js' query builder.
    // Requests carry the local session token, or none when signed out.
    return createClient<Database>(window.location.origin, 'local-dev', {
      accessToken: async () => readLocalSession()?.access_token ?? null,
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers)
          headers.delete('apikey')
          if (headers.get('authorization') === 'Bearer local-dev') headers.delete('authorization')
          return fetch(input, { ...init, headers })
        },
      },
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

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export class AuthError extends Error {}

const LOCAL_ERRORS: Record<string, string> = {
  invalid_credentials: 'That email and password do not match an account.',
  too_many_attempts: 'Too many failed attempts. Wait 15 minutes and try again.',
}

/** Signs in with email and password; resolves to the auth user id. */
export const signIn = async (email: string, password: string): Promise<string> => {
  if (dbProvider === 'local') {
    const { data, error } = await db.rpc('local_login', { _email: email, _password: password })
    if (error) throw new AuthError('The sign-in service is not reachable. Is the local database running?')
    const res = data as unknown as Partial<LocalSession> & { error?: string }
    if (res.error || !res.access_token) throw new AuthError(LOCAL_ERRORS[res.error ?? ''] ?? 'We could not sign you in.')
    writeLocalSession(res as LocalSession)
    return res.user!.id
  }
  if (!import.meta.env.VITE_SUPABASE_URL) {
    throw new AuthError('Sign-in is not connected to a database on this site yet.')
  }
  const { data, error } = await db.auth.signInWithPassword({ email, password })
  if (error && !error.status) throw new AuthError('The sign-in service is not reachable. Try again shortly.')
  if (error || !data.user) {
    throw new AuthError(
      error?.status === 429
        ? 'Too many attempts. Wait a few minutes and try again.'
        : 'That email and password do not match an account.',
    )
  }
  return data.user.id
}

export const signOut = async () => {
  if (dbProvider === 'local') {
    if (readLocalSession()) await db.rpc('local_logout')
    writeLocalSession(null)
    return
  }
  await db.auth.signOut()
}

/** The signed-in auth user id, or null. */
export const currentAuthUserId = async (): Promise<string | null> => {
  if (dbProvider === 'local') return readLocalSession()?.user.id ?? null
  const { data } = await db.auth.getSession()
  return data.session?.user.id ?? null
}

/** Notifies when the session ends or changes outside the app's own calls. */
export const onAuthChange = (cb: (userId: string | null) => void) => {
  if (dbProvider === 'local') return () => {}
  const { data } = db.auth.onAuthStateChange((_event, session) => cb(session?.user.id ?? null))
  return () => data.subscription.unsubscribe()
}

/**
 * Accepts an invitation: sets the password for the invited email (creating
 * the login if needed), links it to the school profile and signs in.
 */
export const acceptInvitation = async (token: string, email: string, password: string) => {
  if (dbProvider === 'local') {
    const { data, error } = await db.rpc('local_accept_invitation', { _token: token, _password: password })
    if (error) throw new AuthError(error.message)
    writeLocalSession(data as unknown as LocalSession)
    return
  }
  const signUp = await db.auth.signUp({ email, password })
  if (signUp.error) {
    // Already has a login (e.g. a parent invited by a second school): sign in instead.
    const signInRes = await db.auth.signInWithPassword({ email, password })
    if (signInRes.error) throw new AuthError('This email already has a login. Enter its current password.')
  } else if (!signUp.data.session) {
    throw new AuthError('Check your email to confirm your address, then open the invitation link again.')
  }
  const { error } = await db.rpc('accept_invitation', { _token: token })
  if (error) throw new AuthError(error.message)
}

/** Sends a password-reset email. Only available with hosted Supabase. */
export const passwordResetAvailable = dbProvider === 'supabase'
export const requestPasswordReset = async (email: string) => {
  if (!passwordResetAvailable) throw new AuthError('Password reset by email is not available on the laptop database.')
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw new AuthError('We could not send the reset email. Try again later.')
}

export const updatePassword = async (password: string) => {
  const { error } = await db.auth.updateUser({ password })
  if (error) throw new AuthError(error.message)
}

// ---------------------------------------------------------------------------
// Second factor (TOTP). Supabase Auth only; the database refuses admin
// powers to a password-only Supabase session (see has_permission).
// ---------------------------------------------------------------------------
export const mfaAvailable = dbProvider === 'supabase'

export type MfaState =
  | { kind: 'not_needed' }
  | { kind: 'enroll' }
  | { kind: 'challenge'; factorId: string }

export const mfaState = async (): Promise<MfaState> => {
  if (!mfaAvailable) return { kind: 'not_needed' }
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === 'aal2') return { kind: 'not_needed' }
  const { data: factors } = await db.auth.mfa.listFactors()
  const totp = factors?.totp.find((f) => f.status === 'verified')
  return totp ? { kind: 'challenge', factorId: totp.id } : { kind: 'enroll' }
}

export const mfaEnroll = async () => {
  const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' })
  if (error || !data) throw new AuthError('We could not start authenticator setup.')
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

export const mfaVerify = async (factorId: string, code: string) => {
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code })
  if (error) throw new AuthError('That code is not correct. Check the time on your phone and try again.')
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// Uploads a school asset (logo, banner) under the school's folder and returns
// a URL the UI can display. Storage rules only let that school's admins write there.
export const uploadSchoolAsset = async (file: File, schoolId: string, name: string): Promise<string> => {
  // No object storage locally: store the image inline as a data URL.
  if (dbProvider === 'local') return readAsDataUrl(file)

  const ext = file.name.split('.').pop()
  const path = `${schoolId}/${name}-${Date.now()}.${ext}`
  const { error } = await db.storage.from('school-assets').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = db.storage.from('school-assets').getPublicUrl(path)
  return data.publicUrl
}
