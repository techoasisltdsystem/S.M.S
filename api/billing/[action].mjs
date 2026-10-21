import { handle } from '../../server/billing/http.mjs'

// One function serves every /api/billing/<action> route (the Hobby plan allows 12 functions per deployment).
export const config = { api: { bodyParser: false } }
export default (req, res) => {
  const action = String(req.query?.action ?? new URL(req.url, 'http://x').pathname.split('/').pop() ?? '')
  return handle(req, res, action)
}
