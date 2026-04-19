import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { sendMarkdown } from '../services/wecom'
import { isDuplicate, isRateLimited } from '../services/dedup'
import { now } from '../services/formatter'

const app = new Hono<AppEnv>()

/**
 * POST /webhook/agiso
 * 预留：接收阿奇索开放平台 tradePush 订单推送
 */
app.post('/webhook/agiso', async (c) => {
  const body = await c.req.json()
  if (body.test) return c.json({ success: true })

  const type = body.type || body.msgTag || 'unknown'
  const dedupKey = `agiso:${type}:${body.tid || Date.now()}`

  if (await isDuplicate(c.env.KV, dedupKey)) {
    return c.json({ success: true, action: 'deduped' })
  }
  if (await isRateLimited(c.env.KV)) {
    return c.json({ success: true, action: 'rate_limited' })
  }

  const content = [
    `## 🛒 阿奇索推送: ${type}`,
    `> **时间**: ${now()}`,
    `> **数据**: ${JSON.stringify(body).slice(0, 200)}`,
  ].join('\n')

  await sendMarkdown(c.env.WECOM_WEBHOOK_KEY, content)
  return c.json({ success: true })
})

export default app
