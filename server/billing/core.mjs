// Billing backend: talks to Paystack and the database. Runs as Vercel functions (api/billing/*)
// and, on a laptop, inside the Vite dev server. The browser never sends an amount, a status, or a
// secret here: it sends a payment reference, and everything else is read from the database or from
// Paystack itself.
//
// Settings (environment only, never in the database or the browser):
//   PAYSTACK_SECRET_KEY   sk_test_... or sk_live_...  (without it, real payments are unavailable)
//   APP_URL               public address of the site, used for the Paystack return link
//   BILLING_DEMO=on       allow the clearly-labelled demo checkout (development only; ignored in production)
//   DATABASE_URL (or the Neon variables)  owner connection used to settle orders
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import pg from 'pg'

const PAYSTACK = 'https://api.paystack.co'

export const makeEnv = (extra = {}) => (key) => extra[key] ?? process.env[key]

const isProduction = (env) => env('VERCEL_ENV') === 'production' || env('NODE_ENV') === 'production'

let pool
const getPool = (env) => {
  if (pool) return pool
  const url = ['STORAGE_DATABASE_URL_UNPOOLED', 'STORAGE_POSTGRES_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED', 'STORAGE_DATABASE_URL', 'DATABASE_URL']
    .map(env).find(Boolean)
  if (!url) throw new HttpError(503, 'The billing service has no database configured.')
  pool = new pg.Pool({ connectionString: url, max: 4 })
  return pool
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// Tests run every query on one transaction (see selftest.mjs) so they leave nothing behind.
let runner = null
export const useRunner = (r) => { runner = r }

const one = async (env, text, params) => (await (runner ?? getPool(env)).query(text, params)).rows[0]

/** Which payment mode is on: 'paystack' (real), 'demo' (development only) or null (unavailable). */
export const paymentMode = (env) => {
  if (env('PAYSTACK_SECRET_KEY')) return 'paystack'
  if (env('BILLING_DEMO') === 'on' && !isProduction(env)) return 'demo'
  return null
}

const appUrl = (env, headers) => {
  const configured = env('APP_URL')
  if (configured) return configured.replace(/\/$/, '')
  const host = headers['x-forwarded-host'] || headers.host
  const proto = headers['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

const paystack = async (env, path, init = {}) => {
  const res = await fetch(`${PAYSTACK}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.status === false) throw new HttpError(502, body.message || `Paystack returned ${res.status}`)
  return body
}

/** Only the fields we need from a Paystack transaction. Card details are never stored. */
const summarise = (data) => ({
  status: data.status, amount_minor: data.amount, currency: data.currency, channel: data.channel,
  paid_at: data.paid_at, transaction_id: data.id == null ? null : String(data.id), gateway_response: data.gateway_response,
})

const claimOk = async (env, reference, claim) => {
  const row = await one(env, `SELECT 1 AS ok FROM public.billing_orders WHERE reference = $1 AND claim_hash = $2`,
    [reference, createHash('sha256').update(String(claim ?? ''), 'utf8').digest()])
  return !!row
}

const requireOrder = async (env, reference, claim) => {
  if (typeof reference !== 'string' || !/^TOS-[A-F0-9]{14}$/.test(reference)) throw new HttpError(400, 'That payment reference is not valid.')
  if (!(await claimOk(env, reference, claim))) throw new HttpError(404, 'We could not find that order.')
  const order = (await one(env, `SELECT public.billing_gateway_order($1) AS o`, [reference])).o
  if (!order) throw new HttpError(404, 'We could not find that order.')
  return order
}

/** Start checkout for an order the browser already created. The amount comes from the database. */
export const initialize = async (env, headers, { reference, claim }) => {
  const order = await requireOrder(env, reference, claim)
  if (order.status === 'paid') return { status: 'paid' }
  if (!['created', 'pending'].includes(order.status)) throw new HttpError(409, 'This payment attempt is closed. Start a new one.')
  const mode = paymentMode(env)
  if (!mode) throw new HttpError(503, 'Online payment is not switched on for this site yet. Please contact support.')
  const base = appUrl(env, headers)

  if (mode === 'demo') {
    await one(env, `SELECT public.billing_mark_initialized($1, 'demo', NULL)`, [reference])
    return { mode: 'demo', url: `${base}/checkout/demo?reference=${encodeURIComponent(reference)}` }
  }

  if (order.gateway === 'paystack' && order.access_code) return { mode: 'paystack', url: `https://checkout.paystack.com/${order.access_code}` }
  const body = await paystack(env, '/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: order.email, amount: Number(order.total_minor), currency: order.currency, reference,
      callback_url: `${base}/checkout/return`,
      // The buyer picks on Paystack's page; only the methods enabled on the merchant account are shown.
      channels: (env('PAYSTACK_CHANNELS') || 'card,mobile_money,bank_transfer').split(',').map((c) => c.trim()).filter(Boolean),
      metadata: { order: reference, plan: order.plan, custom_fields: [] },
    }),
  })
  await one(env, `SELECT public.billing_mark_initialized($1, 'paystack', $2)`, [reference, body.data.access_code])
  await one(env, `SELECT public.billing_record_event($1, 'verify', 'initialize', NULL, NULL, 'initialized', '{}')`, [reference])
  return { mode: 'paystack', url: body.data.authorization_url }
}

/** After a brand-new school is paid for, email the administrator their one-time confirmation link. Never fails the payment. */
const sendWelcome = async (env, headers, reference, result) => {
  if (!result?.ok || result.already) return
  try {
    const o = await one(env, `SELECT purpose, customer_email, invite_token, draft ->> 'school_name' AS school FROM public.billing_orders WHERE reference = $1`, [reference])
    if (!o || o.purpose !== 'new_school' || !o.invite_token) return
    if (!env('APP_URL') && !headers.host) return
    const link = `${appUrl(env, headers)}/accept-invite?token=${o.invite_token}`
    await sendMail(env, { to: o.customer_email, link, subject: 'Confirm your Tech Oasis SMS account',
      text: `Your payment for ${o.school} was confirmed.

Confirm your account and choose your administrator password here (the link works once and expires in 7 days):
${link}

Then sign in at ${appUrl(env, headers)}/login.` })
    await one(env, `SELECT public.billing_record_event($1, 'verify', 'confirmation_email', NULL, NULL, 'sent', '{}')`, [reference])
  } catch (e) {
    await one(env, `SELECT public.billing_record_event($1, 'verify', 'confirmation_email', NULL, NULL, 'failed', $2::jsonb)`, [reference, JSON.stringify({ error: String(e.message).slice(0, 120) })]).catch(() => {})
  }
}

/** Confirm with Paystack and settle. Safe to call repeatedly. */
export const settleFromGateway = async (env, reference, source, externalId = null, signatureValid = null, headers = {}) => {
  const order = (await one(env, `SELECT public.billing_gateway_order($1) AS o`, [reference])).o
  if (!order) {
    await one(env, `SELECT public.billing_record_event($1, $2, 'unknown_reference', $3, $4, 'ignored', '{}')`, [reference, source, externalId, signatureValid])
    return { status: 'unknown' }
  }
  if (order.status === 'paid') return { status: 'paid' }
  if (order.gateway === 'demo') throw new HttpError(400, 'This is a demo order; it cannot be verified with Paystack.')
  const verify = await paystack(env, `/transaction/verify/${encodeURIComponent(reference)}`)
  const summary = summarise(verify.data)
  const result = (await one(env, `SELECT public.billing_settle($1, $2::jsonb, false) AS r`, [reference, JSON.stringify(summary)])).r
  await sendWelcome(env, headers, reference, result)
  await one(env, `SELECT public.billing_record_event($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [reference, source, source === 'webhook' ? 'charge.success' : 'verify', externalId, signatureValid, result.status,
      JSON.stringify({ gateway_status: summary.status, amount_minor: summary.amount_minor, currency: summary.currency, channel: summary.channel })])
  return result
}

/** The return page asks us to confirm the payment; the answer comes from Paystack, not from the URL. */
export const verify = async (env, { reference, claim }, headers = {}) => {
  const order = await requireOrder(env, reference, claim)
  if (order.status === 'paid') return { status: 'paid' }
  if (order.gateway === 'demo') return { status: order.status }
  if (!env('PAYSTACK_SECRET_KEY')) throw new HttpError(503, 'Online payment is not configured.')
  return settleFromGateway(env, reference, 'verify', null, null, headers)
}

const safeEqual = (a, b) => {
  const x = Buffer.from(a, 'utf8'), y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Paystack webhook: check the signature on the exact bytes received, then confirm with Paystack. */
export const webhook = async (env, headers, rawBody) => {
  const secret = env('PAYSTACK_SECRET_KEY')
  if (!secret) throw new HttpError(503, 'Online payment is not configured.')
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const given = String(headers['x-paystack-signature'] ?? '')
  if (!safeEqual(expected, given)) {
    await one(env, `SELECT public.billing_record_event(NULL, 'webhook', 'rejected', NULL, false, 'bad_signature', '{}')`)
    throw new HttpError(401, 'Invalid signature.')
  }
  let event
  try { event = JSON.parse(rawBody.toString('utf8')) } catch { throw new HttpError(400, 'Bad payload.') }
  const reference = event?.data?.reference
  const externalId = `${event?.event}:${event?.data?.id ?? reference}`
  if (event?.event === 'charge.success' && reference) {
    // Settling is idempotent, so a repeated delivery is harmless. The event is recorded only after it
    // was handled: if Paystack was unreachable now, its retry must be processed, not skipped.
    const result = await settleFromGateway(env, reference, 'webhook', null, true, headers)
    const fresh = await one(env, `SELECT public.billing_record_event($1, 'webhook', $2, $3, true, $4, '{}') AS fresh`, [reference, event.event, externalId, result.status ?? 'handled'])
    return fresh.fresh ? { received: true } : { received: true, duplicate: true }
  }
  await one(env, `SELECT public.billing_record_event($1, 'webhook', $2, $3, true, 'noted', $4::jsonb)`,
    [reference ?? null, String(event?.event ?? 'unknown').slice(0, 60), externalId, JSON.stringify({ status: event?.data?.status ?? null })])
  return { received: true }
}

/** Demo checkout: only when explicitly switched on, never in production, and every record is marked demo. */
export const demoPay = async (env, { reference, claim, outcome }, headers = {}) => {
  if (paymentMode(env) !== 'demo') throw new HttpError(404, 'Not found.')
  const order = await requireOrder(env, reference, claim)
  if (order.gateway !== 'demo') throw new HttpError(400, 'This order is not a demo order.')
  if (!['success', 'failed', 'abandoned'].includes(outcome)) throw new HttpError(400, 'Choose an outcome.')
  const verified = { status: outcome, amount_minor: Number(order.total_minor), currency: order.currency, channel: 'demo', transaction_id: `demo-${reference}`, gateway_response: `DEMO ${outcome}` }
  const result = (await one(env, `SELECT public.billing_settle($1, $2::jsonb, true) AS r`, [reference, JSON.stringify(verified)])).r
  await one(env, `SELECT public.billing_record_event($1, 'demo', $2, NULL, NULL, $3, '{}')`, [reference, outcome, result.status])
  await sendWelcome(env, headers, reference, result)
  return { status: result.status }
}

/** What the browser needs to know about the payment setup. No secrets. */
export const config = (env) => ({ mode: paymentMode(env), demo: paymentMode(env) === 'demo' })

// A small in-memory limiter. On serverless hosts each instance has its own memory, so this slows
// casual abuse only; put a real rate limit in front of the site for anything more.
const hits = new Map()
export const rateLimit = (key, max = 30, windowMs = 60_000) => {
  const now = Date.now()
  const entry = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  entry.push(now)
  hits.set(key, entry)
  if (entry.length > max) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.')
}

// ---------------------------------------------------------------------------------------------
// Account recovery email (local sign-in). Hosted providers send their own recovery email.
// ---------------------------------------------------------------------------------------------
const sendMail = async (env, { to, subject, text, link }) => {
  if (env('RESEND_API_KEY') && env('MAIL_FROM')) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('MAIL_FROM'), to: [to], subject, text }),
    })
    if (!res.ok) throw new Error(`The email service refused the message (${res.status}).`)
    return
  }
  if (env('MAIL_DEV_LOG') === 'on' && !isProduction(env)) {
    // Development only: the link goes to this server's console, never to the browser or the database.
    console.log(`[dev mail] to ${to}: ${subject}\n  ${link}`)
    return
  }
  throw new Error('Email delivery is not configured on this server (set RESEND_API_KEY and MAIL_FROM).')
}

const resetEmail = (env, headers, to, token, who) => {
  const link = `${appUrl(env, headers)}/reset-password?token=${token}`
  return sendMail(env, {
    to, link, subject: 'Reset your Tech Oasis SMS password',
    text: `${who} asked to reset the password for this account.\n\nChoose a new password here (the link works once and expires in one hour):\n${link}\n\nIf you did not expect this, ignore this email; your password has not changed.`,
  })
}

/** "Forgot password": always answers the same way, whether or not the address has an account. */
export const recoverRequest = async (env, headers, { email }) => {
  if (typeof email !== 'string' || email.length > 200) throw new HttpError(400, 'Enter your email address.')
  // Say so plainly if this server cannot send email at all, instead of pretending a message is on its way.
  if (!(env('RESEND_API_KEY') && env('MAIL_FROM')) && !(env('MAIL_DEV_LOG') === 'on' && !isProduction(env))) {
    throw new HttpError(503, 'Password reset email is not set up on this server yet. Please contact your school administrator.')
  }
  const issued = (await one(env, `SELECT public.recovery_issue_for_email($1) AS r`, [email])).r
  if (issued) {
    try {
      await resetEmail(env, headers, issued.email, issued.token, 'You')
      await one(env, `SELECT public.recovery_mark($1, true, NULL)`, [issued.id])
    } catch (e) {
      await one(env, `SELECT public.recovery_mark($1, false, $2)`, [issued.id, e.message])
      console.error('[recovery]', e.message)
    }
  }
  return { ok: true }
}

/** The Super Admin started a reset for a School Admin; this sends it and records the real outcome. */
export const recoverSend = async (env, headers, { request }) => {
  if (typeof request !== 'string' || !/^[0-9a-f-]{36}$/.test(request)) throw new HttpError(400, 'Bad request.')
  const issued = (await one(env, `SELECT public.recovery_issue($1) AS r`, [request])).r
  if (!issued) throw new HttpError(409, 'That reset request is not waiting to be sent.')
  try {
    await resetEmail(env, headers, issued.email, issued.token, 'Tech Oasis support, on your school\'s request,')
    await one(env, `SELECT public.recovery_mark($1, true, NULL)`, [request])
    return { state: 'sent' }
  } catch (e) {
    await one(env, `SELECT public.recovery_mark($1, false, $2)`, [request, e.message])
    return { state: 'failed', error: e.message }
  }
}

// ---------------------------------------------------------------------------------------------
// Public (signed-out) billing calls. A visitor has no sign-in token, and hosted Data APIs refuse
// anonymous calls, so these few functions are reached through the server. They are the same
// database functions the laptop calls directly; the database still prices and validates everything.
// ---------------------------------------------------------------------------------------------
const USER_ERRORS = new Set(['22023', '23505', '54000', 'P0002'])
const callPublic = async (env, text, params) => {
  try { return (await one(env, text, params)).r }
  catch (e) {
    if (USER_ERRORS.has(e.code)) throw new HttpError(400, e.message)
    throw e
  }
}

export const publicPricing = (env) => callPublic(env, `SELECT public.billing_public_pricing() AS r`, [])
export const publicSignup = (env, b) => callPublic(env,
  `SELECT public.billing_start_signup($1, $2, $3, $4, $5, $6) AS r`,
  [b.plan, b.interval, b.school, b.admin, b.email, b.phone ?? null])
export const publicStatus = (env, b) => callPublic(env, `SELECT public.billing_order_status($1, $2) AS r`, [b.reference, b.claim])
export const publicClaim = async (env, b) => ({ token: await callPublic(env, `SELECT public.billing_claim_invite($1, $2) AS r`, [b.reference, b.claim]) })

// ---------------------------------------------------------------------------------------------
// Platform team: a signed-in Super Admin adds another Super Admin. The caller proves who they are
// with their own sign-in token; the database (is_platform_admin) decides, never the browser.
// ---------------------------------------------------------------------------------------------
const NEON_DATA_API = 'https://ep-ancient-darkness-bagaak83.apirest.c-8.eu-central-1.aws.neon.tech/neondb/rest/v1'
const NEON_AUTH = 'https://ep-ancient-darkness-bagaak83.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth'
const isLocalDb = (env) => env('VITE_DB_PROVIDER') === 'local'

const callerRpc = async (env, authorization, fn) => {
  const base = isLocalDb(env) ? 'http://127.0.0.1:3001' : (env('NEON_DATA_API_URL') || NEON_DATA_API)
  const res = await fetch(`${base}/rpc/${fn}`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: '{}',
  })
  if (!res.ok) return null
  return res.json()
}

/** A strong one-time password: 16 characters, no look-alikes. */
const makeTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(16)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export const addPlatformAdmin = async (env, headers, { email, name }) => {
  const authorization = headers.authorization
  if (!authorization || (await callerRpc(env, authorization, 'is_platform_admin')) !== true) {
    throw new HttpError(403, 'Only a signed-in Super Admin can add another Super Admin.')
  }
  const addr = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const full = typeof name === 'string' ? name.trim().slice(0, 100) : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) || addr.length > 200) throw new HttpError(400, 'Enter a valid email address.')
  if (full.length < 2) throw new HttpError(400, 'Enter the new Super Admin\'s full name.')
  const users = isLocalDb(env) ? "auth.users" : "neon_auth.\"user\""
  const existing = await one(env, `SELECT id FROM ${users} WHERE lower(email) = $1`, [addr])
  const password = makeTempPassword()
  let userId
  if (isLocalDb(env)) {
    if (existing) throw new HttpError(409, 'That email already has a login. Use a different email address.')
    userId = (await one(env, `SELECT auth_local.create_platform_admin($1, $2) AS id`, [addr, password])).id
    await one(env, `UPDATE auth.users SET must_change_password = TRUE WHERE id = $1 RETURNING id`, [userId])
  } else {
    if (existing) throw new HttpError(409, 'That email already has a login. Use a different email address.')
    const res = await fetch(`${env('NEON_AUTH_URL') || NEON_AUTH}/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: appUrl(env, headers) },
      body: JSON.stringify({ email: addr, password, name: full }),
    })
    if (!res.ok) throw new HttpError(502, 'The sign-in service could not create that login. Try again shortly.')
    const row = await one(env, `SELECT id FROM ${users} WHERE lower(email) = $1`, [addr])
    if (!row) throw new HttpError(502, 'The login was created but could not be found. Try again.')
    userId = row.id
  }
  // Recorded through the caller's own token so the database checks they are a Super Admin and notes who added this one.
  const base = isLocalDb(env) ? 'http://127.0.0.1:3001' : (env('NEON_DATA_API_URL') || NEON_DATA_API)
  const reg = await fetch(`${base}/rpc/platform_admin_register`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ _user: userId, _name: full }),
  })
  if (!reg.ok) throw new HttpError(409, 'The login was created but could not be made a Super Admin.')
  return { email: addr, password, name: full }
}
