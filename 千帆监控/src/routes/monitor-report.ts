import { Hono } from 'hono'
import type { AppEnv, ReportPayload } from '../types'
import { sendMarkdown } from '../services/wecom'
import { isRateLimited } from '../services/dedup'
import * as fmt from '../services/formatter'

const app = new Hono<AppEnv>()

/** 鉴权中间件 */
app.use('/*', async (c, next) => {
  const secret = c.req.header('X-Report-Secret')
  if (secret !== c.env.REPORT_SECRET) {
    return c.json({ error: '鉴权失败' }, 401)
  }
  await next()
})

/**
 * POST /report
 * Windows 监控脚本上报事件
 */
app.post('/report', async (c) => {
  const body = await c.req.json<ReportPayload>()
  const { type, message } = body

  if (await isRateLimited(c.env.KV)) {
    return c.json({ ok: true, action: 'rate_limited' })
  }

  // 千帆新消息通知已关闭（2026-03-30）：订单量稳定后无需每条消息都推企微
  // 保留进程状态通知（process_down/process_up/error），确保发货助手离线时能及时感知
  if (type === 'new_message' || type === 'flash_detected') {
    // content = fmt.formatNewMessage()
    // await sendMarkdown(c.env.WECOM_WEBHOOK_KEY, content)
    return c.json({ ok: true, action: 'skipped' })
  }

  let content: string
  switch (type) {
    case 'process_down':
      content = fmt.formatProcessDown()
      break
    case 'process_up':
      content = fmt.formatProcessUp()
      break
    case 'error':
      content = fmt.formatError(message || '未知错误')
      break
    default:
      content = fmt.formatReport(type, message)
  }

  await sendMarkdown(c.env.WECOM_WEBHOOK_KEY, content)

  return c.json({ ok: true, action: 'sent' })
})

/**
 * POST /heartbeat
 */
app.post('/heartbeat', async (c) => {
  return c.json({ ok: true })
})

export default app
