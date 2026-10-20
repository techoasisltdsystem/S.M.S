// Audit monitor: runs outside the web app so a failed audit service cannot hide its own failure.
//
//   node scripts/audit-monitor.mjs            run one health check, deliver alerts, exit
//   node scripts/audit-monitor.mjs --watch    repeat every AUDIT_MONITOR_INTERVAL_SECONDS (default 300)
//   node scripts/audit-monitor.mjs --verify   independent check: is the monitor still reporting? (run this
//                                             from a different scheduler or host than the main job)
//
// Settings (environment, never stored in the database):
//   DATABASE_URL (or the Neon variables)  database to check
//   AUDIT_ALERT_WEBHOOK_URL               urgent channel (Slack-compatible JSON: {"text": "..."})
//
// If the database cannot be reached, or the health check itself crashes, nothing in the database can
// raise an incident, so this script sends the alert directly to the webhook and writes it to
// logs/audit-monitor-alerts.log. Exit code 1 means "something needs attention".
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Read .env.local for laptop use; real environment variables win.
const readEnvFile = () => {
  const file = join(root, '.env.local')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  )
}
const fileEnv = readEnvFile()
const env = (k) => process.env[k] ?? fileEnv[k]

const dbUrl = ['STORAGE_DATABASE_URL_UNPOOLED', 'STORAGE_POSTGRES_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED', 'STORAGE_DATABASE_URL', 'DATABASE_URL']
  .map(env).find(Boolean)
const webhook = env('AUDIT_ALERT_WEBHOOK_URL')
const args = new Set(process.argv.slice(2))
const intervalMs = Math.max(30, Number(env('AUDIT_MONITOR_INTERVAL_SECONDS') ?? 300)) * 1000

const logAlert = (text) => {
  const dir = join(root, 'logs')
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, 'audit-monitor-alerts.log'), `${new Date().toISOString()} ${text}\n`)
}

const post = async (text, severity = 'critical') => {
  if (!webhook) return { ok: false, error: 'AUDIT_ALERT_WEBHOOK_URL is not set' }
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, severity }),
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok ? { ok: true } : { ok: false, error: `webhook answered ${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'webhook unreachable' }
  }
}

// The fallback path: used when the database cannot report the problem itself.
const fallbackAlert = async (title, detail) => {
  const text = `[Critical] ${title}\n${detail}\nTime: ${new Date().toISOString()}\nNext steps: check the database and restart the audit monitor (npm run audit:monitor).`
  logAlert(text.replace(/\n/g, ' | '))
  const sent = await post(text)
  console.error(`ALERT: ${title} (${detail})${sent.ok ? ' [webhook sent]' : ` [webhook not sent: ${sent.error}]`}`)
}

const connect = async () => {
  const useSsl = !/localhost|127\.0\.0\.1/.test(dbUrl ?? '')
  const client = new pg.Client({ connectionString: dbUrl, ssl: useSsl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 10_000 })
  await client.connect()
  return client
}

const deliverOutbox = async (client) => {
  const { rows } = await client.query('SELECT * FROM public.audit_outbox_claim(10)')
  let sent = 0
  for (const r of rows) {
    const result = await post(`[${r.severity}] ${r.title}\n${r.body}`, r.severity)
    await client.query('SELECT public.audit_outbox_mark($1, $2, $3)', [r.outbox_id, result.ok ? 'sent' : 'failed', result.error ?? null])
    if (result.ok) sent += 1
    else console.error(`urgent channel: ${result.error}`)
  }
  return { claimed: rows.length, sent }
}

const run = async () => {
  if (!dbUrl) {
    await fallbackAlert('Audit monitor has no database connection string', 'Set DATABASE_URL (or the Neon variables) for the monitor job.')
    return 1
  }
  let client
  try {
    client = await connect()
  } catch (e) {
    await fallbackAlert('Audit monitor cannot reach the database', e instanceof Error ? e.message.slice(0, 120) : 'connection failed')
    return 1
  }
  try {
    if (args.has('--verify')) {
      // Independent watcher: raises the "monitor stopped" incident if the main job went quiet.
      await client.query('SELECT public.audit_flag_monitor_stale()')
      const { rows } = await client.query('SELECT last_tick_at, now() - last_tick_at AS age FROM public.audit_monitor_state')
      const { rows: cfg } = await client.query('SELECT stale_minutes FROM public.audit_settings')
      const ageMin = rows[0]?.last_tick_at ? (Date.now() - new Date(rows[0].last_tick_at).getTime()) / 60000 : Infinity
      const limit = cfg[0]?.stale_minutes ?? 15
      const delivered = await deliverOutbox(client)
      if (ageMin > limit) {
        await fallbackAlert('Audit monitor has stopped reporting', `Last report: ${rows[0]?.last_tick_at ?? 'never'} (limit ${limit} minutes).`)
        return 1
      }
      console.log(`monitor is reporting (last ${ageMin.toFixed(1)} min ago); urgent channel: ${delivered.sent}/${delivered.claimed} sent`)
      return 0
    }

    const { rows } = await client.query('SELECT public.audit_monitor_tick() AS result')
    const result = rows[0].result
    const delivered = await deliverOutbox(client)
    console.log(`health check ${result.status}; urgent channel: ${delivered.sent}/${delivered.claimed} sent`)
    return result.status === 'passed' ? 0 : 1
  } catch (e) {
    await fallbackAlert('Audit health check could not run', e instanceof Error ? e.message.slice(0, 120) : 'unknown error')
    return 1
  } finally {
    await client.end().catch(() => undefined)
  }
}

if (args.has('--watch')) {
  console.log(`audit monitor running every ${intervalMs / 1000} s`)
  for (;;) {
    await run()
    await new Promise((r) => setTimeout(r, intervalMs))
  }
} else {
  process.exit(await run())
}
