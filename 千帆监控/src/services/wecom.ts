// 企业微信群机器人消息发送

const WECOM_API = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send'

/** 发送 Markdown 消息 */
export async function sendMarkdown(key: string, content: string): Promise<boolean> {
  const resp = await fetch(`${WECOM_API}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
  })
  const result = await resp.json<{ errcode: number; errmsg: string }>()
  return result.errcode === 0
}

/** 发送纯文本消息 */
export async function sendText(key: string, content: string): Promise<boolean> {
  const resp = await fetch(`${WECOM_API}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content } }),
  })
  const result = await resp.json<{ errcode: number; errmsg: string }>()
  return result.errcode === 0
}
