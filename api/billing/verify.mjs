import { handle } from '../../server/billing/http.mjs'

// Vercel passes the body through untouched so the webhook signature can be checked on the raw bytes.
export const config = { api: { bodyParser: false } }
export default (req, res) => handle(req, res, 'verify')
