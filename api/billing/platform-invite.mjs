import { handle } from '../../server/billing/http.mjs'

export const config = { api: { bodyParser: false } }
export default (req, res) => handle(req, res, 'platform-invite')
