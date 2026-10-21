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
    if (isFeeReference(reference)) {
      const fee = await feeSettleFromGateway(env, reference, 'webhook')
      return { received: true, status: fee.status }
    }
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
// Platform team. A Super Admin invites another administrator by email. The invitee follows a one-time
// link and chooses their own password; no password is ever generated, shown or emailed. The caller
// proves who they are with their own sign-in token and the database checks their permission.
// ---------------------------------------------------------------------------------------------
const NEON_DATA_API = 'https://ep-ancient-darkness-bagaak83.apirest.c-8.eu-central-1.aws.neon.tech/neondb/rest/v1'
const NEON_AUTH = 'https://ep-ancient-darkness-bagaak83.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth'
const isLocalDb = (env) => env('VITE_DB_PROVIDER') === 'local'
const hashToken = (t) => createHash('sha256').update(t).digest('hex')

/** Calls a database function as the signed-in caller, so the database applies that person's permissions. */
const asCaller = async (env, authorization, fn, args = {}) => {
  if (!authorization) throw new HttpError(401, 'Sign in first.')
  const base = isLocalDb(env) ? 'http://127.0.0.1:3001' : (env('NEON_DATA_API_URL') || NEON_DATA_API)
  const res = await fetch(`${base}/rpc/${fn}`, { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(args) })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 || body?.code === '42501' ? 403 : 400, body?.message ?? 'The request was refused.')
  return body
}

const inviteEmail = (env, headers, to, name, token) => {
  const link = `${appUrl(env, headers)}/platform-invite?token=${token}`
  return { link, send: () => sendMail(env, {
    to, link, subject: 'You have been invited to the Tech Oasis platform console',
    text: `Hello ${name},

You have been invited to join the Tech Oasis platform console.

Choose your own password here (the link works once and expires in 7 days):
${link}

If you did not expect this, ignore this email.`,
  }) }
}

/** Create or resend an invitation, or revoke one. Returns the link only when email could not be sent. */
export const platformInvite = async (env, headers, b) => {
  const auth = headers.authorization
  if (b.action === 'revoke') { await asCaller(env, auth, 'platform_invite_revoke', { _id: b.id }); return { ok: true } }
  const token = randomBytes(32).toString('base64url')
  let email, name
  if (b.action === 'resend') {
    const r = await asCaller(env, auth, 'platform_invite_rotate', { _id: b.id, _token_hash: hashToken(token) })
    ;[{ email, full_name: name }] = r
  } else {
    email = String(b.email ?? '').trim().toLowerCase(); name = String(b.name ?? '').trim()
    await asCaller(env, auth, 'platform_invite_create', { _email: email, _name: name, _role: b.role, _perms: Array.isArray(b.permissions) ? b.permissions : [], _token_hash: hashToken(token) })
  }
  const mail = inviteEmail(env, headers, email, name, token)
  try { await mail.send(); return { emailed: true, email } }
  catch (e) { console.error('[platform-invite]', e.message); return { emailed: false, email, link: mail.link } }
}

/** What an invitation link is for (shown before the person sets a password). */
export const platformInviteInfo = async (env, { token }) => {
  if (typeof token !== 'string' || token.length < 20) throw new HttpError(400, 'This invitation link is not valid.')
  const row = await one(env, `SELECT email, full_name, role FROM public.platform_invite_peek($1)`, [hashToken(token)])
  if (!row) throw new HttpError(404, 'This invitation has expired or was already used. Ask for a new one.')
  return { email: row.email, name: row.full_name, role: row.role }
}

/** The invitee sets a password; the server creates the login and attaches the invited role. */
export const platformInviteAccept = async (env, headers, { token, password }) => {
  if (typeof token !== 'string' || token.length < 20) throw new HttpError(400, 'This invitation link is not valid.')
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new HttpError(400, 'Use a password of at least 12 characters.')
  const hash = hashToken(token)
  const inv = await one(env, `SELECT email, full_name FROM public.platform_invite_peek($1)`, [hash])
  if (!inv) throw new HttpError(404, 'This invitation has expired or was already used. Ask for a new one.')
  const users = isLocalDb(env) ? 'auth.users' : 'neon_auth."user"'
  if (await one(env, `SELECT id FROM ${users} WHERE lower(email) = $1`, [inv.email])) throw new HttpError(409, 'That email already has a login.')
  let userId
  if (isLocalDb(env)) {
    userId = (await one(env, `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at) VALUES ($1, crypt($2, gen_salt('bf', 10)), now()) RETURNING id`, [inv.email, password])).id
  } else {
    const res = await fetch(`${env('NEON_AUTH_URL') || NEON_AUTH}/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: appUrl(env, headers) },
      body: JSON.stringify({ email: inv.email, password, name: inv.full_name }),
    })
    if (!res.ok) throw new HttpError(502, 'The sign-in service could not create your login. Check the password and try again.')
    userId = (await one(env, `SELECT id FROM ${users} WHERE lower(email) = $1`, [inv.email])).id
  }
  try { await one(env, `SELECT public.platform_invite_accept($1, $2)`, [hash, userId]) }
  catch (e) { console.error('[platform-invite]', e.message); throw new HttpError(409, 'Your login was created but the invitation could not be completed. Ask for a new invitation.') }
  return { ok: true, email: inv.email }
}

// ---------------------------------------------------------------------------------------------
// School fee payments. These are the school's money, kept apart from platform subscription orders:
// separate tables, separate references (FEE-...), and they settle into the school's own fee ledger.
// The amount, invoice and payer are fixed in the database when the order is created; the browser
// only ever names an invoice and an amount, and the database decides if that is allowed.
// ---------------------------------------------------------------------------------------------
const isFeeReference = (r) => typeof r === 'string' && /^FEE-[A-Z0-9]{8,32}$/.test(r)

export const feeInitialize = async (env, headers, { invoice, amount }) => {
  if (!env('PAYSTACK_SECRET_KEY')) throw new HttpError(503, 'Online payment is not switched on for this site yet. Please pay at the school office.')
  if (typeof invoice !== 'string' || !/^[0-9a-f-]{36}$/.test(invoice)) throw new HttpError(400, 'Choose an invoice to pay.')
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0 || n > 10000000) throw new HttpError(400, 'Enter a valid amount.')
  const started = await asCaller(env, headers.authorization, 'fee_pay_start', { _invoice: invoice, _amount: n })
  const order = (await one(env, `SELECT public.fee_order_for_server($1) AS o`, [started.reference])).o
  const base = appUrl(env, headers)
  let body
  try {
    body = await paystack(env, '/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: order.email, amount: Number(order.amount_minor), currency: order.currency, reference: order.reference,
      callback_url: `${base}/fees/return?reference=${encodeURIComponent(order.reference)}`,
      channels: (env('PAYSTACK_CHANNELS') || 'card,mobile_money,bank_transfer').split(',').map((c) => c.trim()).filter(Boolean),
      metadata: { kind: 'school_fee', order: order.reference, custom_fields: [] },
    }),
  })
  } catch (e) {
    // The attempt never reached Paystack: close it so it does not sit around as a pending payment.
    await one(env, `SELECT public.fee_settle($1, $2::jsonb)`, [order.reference, JSON.stringify({ status: 'failed', gateway_response: String(e.message).slice(0, 200) })])
    throw e
  }
  await one(env, `SELECT public.fee_mark_initialized($1, $2)`, [order.reference, body.data.access_code])
  await one(env, `SELECT public.fee_record_event($1, 'initialize', 'initialized', '{}')`, [order.reference])
  return { reference: order.reference, url: body.data.authorization_url }
}

/** Ask Paystack what happened, then let the database settle. Used by the return page, the webhook and reconciliation. */
export const feeSettleFromGateway = async (env, reference, source) => {
  if (!isFeeReference(reference)) return { status: 'unknown' }
  const order = (await one(env, `SELECT public.fee_order_for_server($1) AS o`, [reference])).o
  if (!order) { await one(env, `SELECT public.fee_record_event($1, $2, 'unknown_reference', '{}')`, [reference, source]); return { status: 'unknown' } }
  if (order.status === 'paid') return { status: 'paid' }
  const verify = await paystack(env, `/transaction/verify/${encodeURIComponent(reference)}`)
  const summary = summarise(verify.data)
  const result = (await one(env, `SELECT public.fee_settle($1, $2::jsonb) AS r`, [reference, JSON.stringify(summary)])).r
  await one(env, `SELECT public.fee_record_event($1, $2, $3, $4::jsonb)`,
    [reference, source, result.status, JSON.stringify({ gateway_status: summary.status, amount_minor: summary.amount_minor, currency: summary.currency, channel: summary.channel })])
  return result
}

/** The return page asks; the answer comes from Paystack, and only the payer or finance staff may ask. */
export const feeVerify = async (env, headers, { reference }) => {
  if (!isFeeReference(reference)) throw new HttpError(400, 'That payment reference is not valid.')
  await asCaller(env, headers.authorization, 'fee_pay_status', { _reference: reference })
  if (!env('PAYSTACK_SECRET_KEY')) throw new HttpError(503, 'Online payment is not configured.')
  await feeSettleFromGateway(env, reference, 'verify')
  return asCaller(env, headers.authorization, 'fee_pay_status', { _reference: reference })
}

// ---------------------------------------------------------------------------------------------
// Refunds, reconciliation, the email outbox and the scheduled job
// ---------------------------------------------------------------------------------------------
const emailReady = (env) => !!((env('RESEND_API_KEY') && env('MAIL_FROM')) || (env('MAIL_DEV_LOG') === 'on' && !isProduction(env)))

/** Send queued emails. Delivery is tracked per message; a failure never touches the payment or event that caused it. */
export const runOutbox = async (env) => {
  if (!emailReady(env)) return { skipped: 'Email delivery is not configured (set RESEND_API_KEY and MAIL_FROM).' }
  const batch = (await (runner ?? getPool(env)).query(`SELECT * FROM public.outbox_claim(25)`)).rows
  let sent = 0, failed = 0
  for (const m of batch) {
    try {
      await sendMail(env, { to: m.to_email, subject: m.subject, text: m.body, link: '(in-app notification)' })
      await one(env, `SELECT public.outbox_mark($1, true, NULL)`, [m.id]); sent += 1
    } catch (e) {
      await one(env, `SELECT public.outbox_mark($1, false, $2)`, [m.id, e.message]); failed += 1
    }
  }
  return { claimed: batch.length, sent, failed }
}

/** Re-check stuck online attempts with Paystack and settle what Paystack confirms. Idempotent. */
const reconcileOrders = async (env, school = null) => {
  if (!env('PAYSTACK_SECRET_KEY')) return { checked: 0, skipped: 'Paystack is not configured.' }
  const refs = (await (runner ?? getPool(env)).query(`SELECT reference FROM public.fee_orders_to_reconcile($1, 25)`, [school])).rows.map((r) => r.reference)
  const counts = {}
  for (const ref of refs) {
    try { const r = await feeSettleFromGateway(env, ref, 'reconcile'); counts[r.status] = (counts[r.status] ?? 0) + 1 }
    catch (e) { counts.error = (counts.error ?? 0) + 1; console.error('[reconcile]', ref, e.message) }
  }
  return { checked: refs.length, ...counts }
}

export const feeReconcile = async (env, headers, { school }) => {
  if (typeof school !== 'string' || !/^[0-9a-f-]{36}$/.test(school)) throw new HttpError(400, 'Choose a school.')
  await asCaller(env, headers.authorization, 'fee_orders_list', { _school: school, _status: null, _limit: 1 })
  return reconcileOrders(env, school)
}

/** Refund a payment (or excess money) through Paystack. The database checks the permission and reverses the ledger first. */
export const feeRefund = async (env, headers, { payment, order, retry, reason }) => {
  const auth = headers.authorization
  let started
  if (retry) started = await asCaller(env, auth, 'fee_refund_retry', { _refund: retry })
  else if (payment) started = await asCaller(env, auth, 'fee_refund_begin', { _payment: payment, _reason: reason })
  else if (order) started = await asCaller(env, auth, 'fee_refund_excess_begin', { _order: order, _reason: reason })
  else throw new HttpError(400, 'Choose what to refund.')
  if (started.method !== 'paystack') return { status: 'refunded', note: 'Recorded. The school returns this money itself.' }
  if (!env('PAYSTACK_SECRET_KEY')) {
    await one(env, `SELECT public.fee_refund_finish($1, false, NULL, 'Paystack is not configured on this server')`, [started.refund_id])
    return { status: 'failed', error: 'Paystack is not configured on this server. The refund is recorded and can be retried.' }
  }
  try {
    const res = await paystack(env, '/refund', { method: 'POST', body: JSON.stringify({ transaction: started.reference, amount: Math.round(Number(started.amount) * 100) }) })
    await one(env, `SELECT public.fee_refund_finish($1, true, $2, NULL)`, [started.refund_id, res.data?.id == null ? null : String(res.data.id)])
    return { status: 'refunded' }
  } catch (e) {
    await one(env, `SELECT public.fee_refund_finish($1, false, NULL, $2)`, [started.refund_id, e.message])
    return { status: 'failed', error: e.message }
  }
}

/** The scheduled job: reminders, event reminders, monitoring, stuck payments, then email. Needs CRON_SECRET. */
export const runCron = async (env, headers) => {
  const secret = env('CRON_SECRET')
  if (!secret) throw new HttpError(503, 'The scheduled job is not set up: add CRON_SECRET.')
  if (!safeEqual(String(headers.authorization ?? ''), `Bearer ${secret}`)) throw new HttpError(401, 'Not allowed.')
  const out = {}
  const step = async (name, fn) => { try { out[name] = await fn() } catch (e) { out[name] = { error: e.message }; console.error('[cron]', name, e.message) } }
  await step('monitoring', async () => { await one(env, `SELECT public.audit_monitor_tick()`); return 'ok' })
  await step('fee_reminders', async () => (await one(env, `SELECT public.fee_reminder_tick() AS n`)).n)
  await step('event_reminders', async () => (await one(env, `SELECT public.calendar_reminder_tick() AS n`)).n)
  await step('reconcile', () => reconcileOrders(env))
  await step('outbox', () => runOutbox(env))
  return out
}
