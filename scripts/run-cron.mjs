// Runs the scheduled job once on this machine (reminders, stuck payments, email). Reads .env.local; needs CRON_SECRET there.
//   npm run cron:run
import { existsSync, readFileSync } from 'node:fs'
import { runCron, makeEnv } from '../server/billing/core.mjs'

const file = existsSync('.env.local')
  ? Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  : {}
const env = makeEnv(file)
const result = await runCron(env, { authorization: `Bearer ${env('CRON_SECRET')}` })
console.log(JSON.stringify(result, null, 2))
process.exit(0)
