// HTTP adapter shared by the Vercel functions and the Vite dev server.
import { HttpError, config, demoPay, initialize, makeEnv, publicClaim, publicPricing, publicSignup, publicStatus, rateLimit, recoverRequest, recoverSend, verify, webhook, platformInvite, platformInviteInfo, platformInviteAccept, feeInitialize, feeVerify, feeReconcile, feeRefund, runCron } from './core.mjs'

const readRaw = async (req) => {
  if (req.rawBody) return Buffer.from(req.rawBody)
  const chunks = []
  for await (const c of req) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks)
}

const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

const routes = {
  config: { method: 'GET', run: (env) => config(env) },
  pricing: { method: 'GET', run: (env) => publicPricing(env) },
  signup: { method: 'POST', json: true, limit: 15, run: (env, _req, body) => publicSignup(env, body) },
  status: { method: 'POST', json: true, limit: 60, run: (env, _req, body) => publicStatus(env, body) },
  claim: { method: 'POST', json: true, limit: 20, run: (env, _req, body) => publicClaim(env, body) },
  initialize: { method: 'POST', json: true, limit: 20, run: (env, req, body) => initialize(env, req.headers, body) },
  verify: { method: 'POST', json: true, limit: 60, run: (env, req, body) => verify(env, body, req.headers) },
  'demo-pay': { method: 'POST', json: true, limit: 30, run: (env, req, body) => demoPay(env, body, req.headers) },
  'recover': { method: 'POST', json: true, limit: 10, run: (env, req, body) => recoverRequest(env, req.headers, body) },
  'recover-send': { method: 'POST', json: true, limit: 10, run: (env, req, body) => recoverSend(env, req.headers, body) },
  'platform-invite': { method: 'POST', json: true, limit: 20, run: (env, req, body) => platformInvite(env, req.headers, body) },
  'platform-invite-info': { method: 'POST', json: true, limit: 30, run: (env, _req, body) => platformInviteInfo(env, body) },
  'platform-invite-accept': { method: 'POST', json: true, limit: 10, run: (env, req, body) => platformInviteAccept(env, req.headers, body) },
  'fee-initialize': { method: 'POST', json: true, limit: 20, run: (env, req, body) => feeInitialize(env, req.headers, body) },
  'fee-verify': { method: 'POST', json: true, limit: 60, run: (env, req, body) => feeVerify(env, req.headers, body) },
  'fee-reconcile': { method: 'POST', json: true, limit: 20, run: (env, req, body) => feeReconcile(env, req.headers, body) },
  'fee-refund': { method: 'POST', json: true, limit: 20, run: (env, req, body) => feeRefund(env, req.headers, body) },
  cron: { method: 'GET', run: (env, req) => runCron(env, req.headers) },
  webhook: { method: 'POST', raw: true, run: (env, req, _body, raw) => webhook(env, req.headers, raw) },
}

/** Handle one request for /api/billing/<action>. */
export const handle = async (req, res, action, extraEnv = {}) => {
  const route = routes[action]
  try {
    if (!route) throw new HttpError(404, 'Not found.')
    if (req.method !== route.method) throw new HttpError(405, 'Method not allowed.')
    const env = makeEnv(extraEnv)
    if (route.limit) rateLimit(`${action}:${req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'x'}`, route.limit)
    const raw = route.method === 'POST' ? await readRaw(req) : Buffer.alloc(0)
    let body = {}
    if (route.json) {
      try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {} } catch { throw new HttpError(400, 'Send JSON.') }
    }
    send(res, 200, await route.run(env, req, body, raw))
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error('[billing]', e)
    send(res, status, { error: status === 500 ? 'Something went wrong on our side. Please try again.' : e.message })
  }
}
