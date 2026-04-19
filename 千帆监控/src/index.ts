import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './types'
import monitorReport from './routes/monitor-report'
import agisoWebhook from './routes/agiso-webhook'

const app = new Hono<AppEnv>()

app.use('/*', cors())
app.get('/health', (c) => c.json({ ok: true, service: 'xhs-notify' }))
app.route('/', monitorReport)
app.route('/', agisoWebhook)
app.notFound((c) => c.json({ error: 'Not Found' }, 404))
app.onError((err, c) => {
  console.error('Worker Error:', err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default { fetch: app.fetch }
