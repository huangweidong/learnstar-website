// 通知消息格式化（Markdown，企微群机器人）

/** 新消息通知 */
export function formatNewMessage(): string {
  return [`## 📦 你有新的小红书订单`, `> **时间**: ${now()}`].join('\n')
}

/** 发货助手掉线 */
export function formatProcessDown(): string {
  return [
    '## 🔴 发货助手已离线',
    `> **时间**: ${now()}`,
    '',
    '请检查 Windows 电脑，<font color="warning">重新启动发货助手</font>！',
  ].join('\n')
}

/** 发货助手恢复 */
export function formatProcessUp(): string {
  return [
    '## ✅ 发货助手已恢复',
    `> **时间**: ${now()}`,
    '> 小红书自动发货助手已重新启动，监控正常',
  ].join('\n')
}

/** 发货异常 */
export function formatError(message: string): string {
  return [
    '## ❌ 发货异常',
    `> **时间**: ${now()}`,
    `> **错误**: ${message}`,
    '',
    '请<font color="warning">立即检查处理</font>！',
  ].join('\n')
}

/** 通用上报 */
export function formatReport(type: string, message?: string): string {
  const lines = [`## 📢 监控上报: ${type}`, `> **时间**: ${now()}`]
  if (message) lines.push(`> **详情**: ${message}`)
  return lines.join('\n')
}

export function now(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}
