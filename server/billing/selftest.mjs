// Tests the billing backend against the laptop database with a fake Paystack. Everything runs in one
// transaction that is rolled back, so no order or school is left behind.
//   npm run billing:test
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { HttpError, demoPay, initialize, makeEnv, recoverSend, settleFromGateway, useRunner, verify, webhook, paymentMode } from './core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const file = existsSync(join(root, '.env.local'))
  ? Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  : {}
const url = process.env.DATABASE_URL ?? file.DATABASE_URL
const SECRET = 'sk_test_fake_secret_for_selftest'
const env = makeEnv({ PAYSTACK_SECRET_KEY: SECRET, APP_URL: 'http://localhost:8080', DATABASE_URL: url })
const demoEnv = makeEnv({ BILLING_DEMO: 'on', DATABASE_URL: url })
const headers = { host: 'localhost:8080' }

let client
let calls = []
const realFetch = globalThis.fetch
let paystackTx = {}   // reference -> what the fake Paystack says about it

test.before(async () => {
  client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query('BEGIN')
  useRunner(client)
  globalThis.fetch = async (u, init = {}) => {
    calls.push({ url: String(u), init })
    const m = String(u).match(/transaction\/verify\/(.+)$/)
    const json = (b, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => b })
    if (m) { const t = paystackTx[decodeURIComponent(m[1])]; return t ? json({ status: true, data: t }) : json({ status: false, message: 'Transaction reference not found' }, false) }
    if (String(u).endsWith('/transaction/initialize')) {
      const b = JSON.parse(init.body)
      return json({ status: true, data: { authorization_url: `https://checkout.paystack.com/ac_${b.reference}`, access_code: `ac_${b.reference}`, reference: b.reference } })
    }
    throw new Error(`unexpected fetch ${u}`)
  }
})
test.after(async () => { globalThis.fetch = realFetch; await client.query('ROLLBACK'); await client.end() })

const signup = async (name) => (await client.query(`SELECT public.billing_start_signup('school','monthly',$1,'Test Admin',$2) AS o`, [name, `${name.replace(/\W/g, '').toLowerCase()}@selftest.invalid`])).rows[0].o
const row = async (ref) => (await client.query(`SELECT status, total_minor, gateway FROM public.billing_orders WHERE reference = $1`, [ref])).rows[0]
const schoolCount = async (name) => Number((await client.query(`SELECT count(*) FROM public.schools WHERE name = $1`, [name])).rows[0].count)
const sign = (body) => createHmac('sha512', SECRET).update(body).digest('hex')
const webhookBody = (ref, id = 111) => Buffer.from(JSON.stringify({ event: 'charge.success', data: { id, reference: ref, status: 'success' } }))

test('real payments need a Paystack key; demos are off by default and never in production', () => {
  assert.equal(paymentMode(makeEnv({})), null)
  assert.equal(paymentMode(env), 'paystack')
  assert.equal(paymentMode(demoEnv), 'demo')
  assert.equal(paymentMode(makeEnv({ BILLING_DEMO: 'on', VERCEL_ENV: 'production' })), null)
})

test('initialize sends the amount stored in the database, not anything from the browser', async () => {
  const o = await signup('Selftest One')
  calls = []
  const r = await initialize(env, headers, { reference: o.reference, claim: o.claim, amount: 1, total_minor: 1 })
  const sent = JSON.parse(calls.find((c) => c.url.endsWith('/transaction/initialize')).init.body)
  assert.equal(sent.amount, 120000)
  assert.equal(sent.currency, 'GHS')
  assert.equal(sent.reference, o.reference)
  assert.match(r.url, /^https:\/\/checkout\.paystack\.com\//)
  assert.equal((await row(o.reference)).status, 'pending')
  assert.equal(calls[0].init.headers.authorization, `Bearer ${SECRET}`)
})

test('initialize refuses a wrong claim and an unknown reference', async () => {
  const o = await signup('Selftest Two')
  await assert.rejects(initialize(env, headers, { reference: o.reference, claim: 'nope' }), (e) => e instanceof HttpError && e.status === 404)
  await assert.rejects(initialize(env, headers, { reference: 'TOS-ABCDEF0123456', claim: 'x' }), (e) => e instanceof HttpError && e.status === 400)
  await assert.rejects(initialize(makeEnv({ DATABASE_URL: url }), headers, { reference: o.reference, claim: o.claim }), (e) => e instanceof HttpError && e.status === 503)
})

test('a webhook with a bad signature is rejected and recorded, and activates nothing', async () => {
  const o = await signup('Selftest Three')
  paystackTx[o.reference] = { status: 'success', amount: 120000, currency: 'GHS', channel: 'card', id: 1 }
  const body = webhookBody(o.reference)
  await assert.rejects(webhook(env, { 'x-paystack-signature': 'abc' }, body), (e) => e instanceof HttpError && e.status === 401)
  await assert.rejects(webhook(env, { 'x-paystack-signature': sign(Buffer.from('{"other":1}')) }, body), (e) => e.status === 401)
  assert.notEqual((await row(o.reference)).status, 'paid')
  assert.equal(await schoolCount('Selftest Three'), 0)
  assert.ok(Number((await client.query(`SELECT count(*) FROM public.payment_events WHERE signature_valid IS FALSE`)).rows[0].count) >= 2)
})

test('a valid webhook is confirmed with Paystack, then activates the school exactly once', async () => {
  const o = await signup('Selftest Four')
  paystackTx[o.reference] = { status: 'success', amount: 120000, currency: 'GHS', channel: 'mobile_money', id: 222, paid_at: new Date().toISOString() }
  const body = webhookBody(o.reference, 222)
  calls = []
  assert.deepEqual(await webhook(env, { 'x-paystack-signature': sign(body) }, body), { received: true })
  assert.ok(calls.some((c) => c.url.includes('/transaction/verify/')), 'it asked Paystack instead of trusting the payload')
  assert.equal((await row(o.reference)).status, 'paid')
  assert.equal(await schoolCount('Selftest Four'), 1)
  const again = await webhook(env, { 'x-paystack-signature': sign(body) }, body)
  assert.equal(again.duplicate, true)
  assert.equal(await schoolCount('Selftest Four'), 1)
  assert.equal(Number((await client.query(`SELECT count(*) FROM public.subscription_periods p JOIN public.billing_orders o ON o.id = p.order_id WHERE o.reference = $1`, [o.reference])).rows[0].count), 1)
  assert.equal((await verify(env, { reference: o.reference, claim: o.claim })).status, 'paid')
})

test('the webhook payload cannot grant what Paystack does not confirm', async () => {
  const o = await signup('Selftest Five')
  paystackTx[o.reference] = { status: 'abandoned', amount: 120000, currency: 'GHS', id: 333 }
  const body = webhookBody(o.reference, 333)
  await webhook(env, { 'x-paystack-signature': sign(body) }, body)
  assert.equal(await schoolCount('Selftest Five'), 0)
  assert.notEqual((await row(o.reference)).status, 'paid')
})

test('a paid amount that does not match the order is flagged, not activated', async () => {
  const o = await signup('Selftest Six')
  paystackTx[o.reference] = { status: 'success', amount: 100, currency: 'GHS', channel: 'card', id: 444 }
  const r = await verify(env, { reference: o.reference, claim: o.claim })
  assert.equal(r.status, 'mismatch')
  assert.equal(await schoolCount('Selftest Six'), 0)
})

test('a failed payment shows as failed and can be retried with a new order', async () => {
  const o = await signup('Selftest Seven')
  paystackTx[o.reference] = { status: 'failed', amount: 120000, currency: 'GHS', gateway_response: 'Declined', id: 555 }
  assert.equal((await verify(env, { reference: o.reference, claim: o.claim })).status, 'failed')
  await assert.rejects(initialize(env, headers, { reference: o.reference, claim: o.claim }), (e) => e.status === 409)
  const retry = await signup('Selftest Seven')
  assert.notEqual(retry.reference, o.reference)
})

test('an event for an unknown reference is recorded and ignored', async () => {
  const body = webhookBody('TOS-00000000000000', 666)
  assert.deepEqual(await webhook(env, { 'x-paystack-signature': sign(body) }, body), { received: true })
  assert.equal((await settleFromGateway(env, 'TOS-00000000000000', 'verify')).status, 'unknown')
})

test('the demo checkout works only when switched on, and its orders are marked demo', async () => {
  const o = await signup('Selftest Eight')
  await assert.rejects(demoPay(env, { reference: o.reference, claim: o.claim, outcome: 'success' }), (e) => e.status === 404)
  const init = await initialize(demoEnv, headers, { reference: o.reference, claim: o.claim })
  assert.equal(init.mode, 'demo')
  await assert.rejects(demoPay(demoEnv, { reference: o.reference, claim: 'wrong', outcome: 'success' }), (e) => e.status === 404)
  assert.equal((await demoPay(demoEnv, { reference: o.reference, claim: o.claim, outcome: 'success' })).status, 'paid')
  assert.equal((await row(o.reference)).gateway, 'demo')
})

test('a demo order cannot be confirmed through the Paystack path', async () => {
  const o = await signup('Selftest Nine')
  await initialize(demoEnv, headers, { reference: o.reference, claim: o.claim })
  await assert.rejects(settleFromGateway(env, o.reference, 'webhook'), (e) => e.status === 400)
})

test('a reset email that cannot be sent is reported as failed, not as sent', async () => {
  const school = (await client.query(`SELECT public.bootstrap_school('Selftest Reset', 'selftest-reset', 'Reset Admin', 'reset@selftest.invalid') AS b`)).rows[0].b
  const uid = (await client.query(`INSERT INTO auth.users (email) VALUES ('reset@selftest.invalid') RETURNING id`)).rows[0].id
  await client.query(`SELECT public.accept_invitation_for($1, 'reset@selftest.invalid', $2)`, [uid, school.token])
  const prof = (await client.query(`SELECT id FROM public.profiles WHERE school_id = $1`, [school.school_id])).rows[0].id
  const plat = (await client.query(`INSERT INTO auth.users (email) VALUES ('plat@selftest.invalid') RETURNING id`)).rows[0].id
  await client.query(`INSERT INTO public.platform_admins (user_id) VALUES ($1)`, [plat])
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: plat, role: 'authenticated' })])
  const req = (await client.query(`SELECT public.platform_request_admin_reset($1, $2) AS r`, [school.school_id, prof])).rows[0].r
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`)
  const out = await recoverSend(makeEnv({ DATABASE_URL: url }), headers, { request: req.id })
  assert.equal(out.state, 'failed')
  assert.match(out.error, /not configured/)
  assert.equal((await client.query(`SELECT state, token_hash IS NULL AS burned FROM public.password_reset_requests WHERE id = $1`, [req.id])).rows[0].burned, true)
})

// ---- School fee payments: same Paystack rules, but they settle into the school's own fee ledger ----
const feeFixture = async (name, amount = 1000) => {
  const b = (await client.query(`SELECT public.bootstrap_school($1, $2, 'Fee Admin', $3) AS b`, [name, name.toLowerCase().replace(/\W+/g, '-'), `fee-${Date.now()}@selftest.invalid`])).rows[0].b
  const school = b.school_id
  const student = (await client.query(`INSERT INTO public.profiles (school_id, full_name, status) VALUES ($1, 'Fee Student', 'active') RETURNING id`, [school])).rows[0].id
  const inv = (await client.query(`INSERT INTO public.invoices (school_id, student_id, number, title, due_on, total) VALUES ($1, $2, 'INV-T-1', 'Term fees', current_date + 30, 3000) RETURNING id`, [school, student])).rows[0].id
  const ref = `FEE-${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, 'X')}`
  await client.query(`INSERT INTO public.fee_payment_orders (school_id, invoice_id, student_id, payer_user_id, payer_email, reference, amount, currency, status)
    VALUES ($1, $2, $3, gen_random_uuid(), 'payer@selftest.invalid', $4, $5, 'GHS', 'pending')`, [school, inv, student, ref, amount])
  return { school, inv, ref }
}
const feePayments = async (inv) => Number((await client.query(`SELECT count(*) FROM public.payments WHERE invoice_id = $1 AND status = 'recorded'`, [inv])).rows[0].count)

test('a school fee webhook settles into the fee ledger once, and never touches platform billing', async () => {
  const f = await feeFixture('Fee School One', 1000)
  paystackTx[f.ref] = { status: 'success', amount: 100000, currency: 'GHS', channel: 'card', id: 901, paid_at: new Date().toISOString() }
  const body = webhookBody(f.ref, 901)
  const before = Number((await client.query(`SELECT count(*) FROM public.billing_orders`)).rows[0].count)
  assert.equal((await webhook(env, { 'x-paystack-signature': sign(body) }, body)).status, 'paid')
  assert.equal((await webhook(env, { 'x-paystack-signature': sign(body) }, body)).status, 'paid')
  assert.equal(await feePayments(f.inv), 1, 'a repeated webhook does not create a second payment')
  assert.equal(Number((await client.query(`SELECT count(*) FROM public.billing_orders`)).rows[0].count), before, 'no platform order was created or changed')
})

test('a school fee payment that Paystack reports as failed adds nothing to the ledger', async () => {
  const f = await feeFixture('Fee School Two', 500)
  paystackTx[f.ref] = { status: 'failed', amount: 50000, currency: 'GHS', id: 902, gateway_response: 'Declined' }
  const body = webhookBody(f.ref, 902)
  assert.equal((await webhook(env, { 'x-paystack-signature': sign(body) }, body)).status, 'failed')
  assert.equal(await feePayments(f.inv), 0)
})

test('a school fee paid with a different amount than ordered is flagged, not applied', async () => {
  const f = await feeFixture('Fee School Three', 800)
  paystackTx[f.ref] = { status: 'success', amount: 10000, currency: 'GHS', id: 903, paid_at: new Date().toISOString() }
  const { feeSettleFromGateway } = await import('./core.mjs')
  assert.equal((await feeSettleFromGateway(env, f.ref, 'verify')).status, 'mismatch')
  assert.equal(await feePayments(f.inv), 0)
})

test('starting a school fee payment needs a signed-in caller and the Paystack key', async () => {
  const { feeInitialize } = await import('./core.mjs')
  await assert.rejects(() => feeInitialize(makeEnv({ DATABASE_URL: url }), {}, { invoice: '00000000-0000-0000-0000-000000000000', amount: 10 }), (e) => e instanceof HttpError && e.status === 503)
  await assert.rejects(() => feeInitialize(env, {}, { invoice: '00000000-0000-0000-0000-000000000000', amount: 10 }), (e) => e instanceof HttpError && e.status === 401)
  await assert.rejects(() => feeInitialize(env, { authorization: 'Bearer x' }, { invoice: 'nope', amount: 10 }), (e) => e instanceof HttpError && e.status === 400)
})

test('the scheduled job refuses callers without the secret, and is off until a secret is set', async () => {
  const { runCron } = await import('./core.mjs')
  await assert.rejects(() => runCron(makeEnv({ DATABASE_URL: url }), {}), (e) => e instanceof HttpError && e.status === 503)
  const withSecret = makeEnv({ CRON_SECRET: 'cron-secret-for-selftest', DATABASE_URL: url })
  await assert.rejects(() => runCron(withSecret, {}), (e) => e instanceof HttpError && e.status === 401)
  await assert.rejects(() => runCron(withSecret, { authorization: 'Bearer wrong' }), (e) => e instanceof HttpError && e.status === 401)
})

test('the outbox does not claim or burn attempts when email is not configured', async () => {
  const { runOutbox } = await import('./core.mjs')
  const before = Number((await client.query(`SELECT coalesce(sum(attempts), 0) AS n FROM public.notification_outbox`)).rows[0].n)
  const r = await runOutbox(makeEnv({ DATABASE_URL: url }))
  assert.ok(r.skipped)
  assert.equal(Number((await client.query(`SELECT coalesce(sum(attempts), 0) AS n FROM public.notification_outbox`)).rows[0].n), before)
})

test('queued email is sent once and a failure is recorded for retry', async () => {
  const { runOutbox } = await import('./core.mjs')
  await client.query(`UPDATE public.notification_outbox SET status = 'dead' WHERE status IN ('pending', 'failed')`)
  const f = await feeFixture('Outbox School', 100)
  await client.query(`INSERT INTO public.notification_outbox (school_id, to_email, subject, body, dedupe_key) VALUES ($1, 'a@selftest.invalid', 'Hello', 'Body', 'selftest-ok'), ($1, 'b@selftest.invalid', 'Fail', 'Body', 'selftest-fail')`, [f.school])
  const mailEnv = makeEnv({ RESEND_API_KEY: 're_test', MAIL_FROM: 'Tech Oasis <noreply@selftest.invalid>', DATABASE_URL: url })
  const real = globalThis.fetch
  globalThis.fetch = async (u, init = {}) => {
    if (String(u).includes('api.resend.com')) { const ok = !String(init.body).includes('b@selftest.invalid'); return { ok, status: ok ? 200 : 500, json: async () => ({}) } }
    return real(u, init)
  }
  try {
    const r = await runOutbox(mailEnv)
    assert.equal(r.sent, 1); assert.equal(r.failed, 1)
  } finally { globalThis.fetch = real }
  const rows = (await client.query(`SELECT dedupe_key, status FROM public.notification_outbox WHERE dedupe_key LIKE 'selftest-%' ORDER BY dedupe_key`)).rows
  assert.deepEqual(rows.map((x) => x.status), ['failed', 'sent'])
})
