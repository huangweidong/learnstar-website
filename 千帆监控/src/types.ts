// Cloudflare Workers 环境绑定
export type Bindings = {
  KV: KVNamespace
  WECOM_WEBHOOK_KEY: string   // 企微群机器人 webhook key
  REPORT_SECRET: string       // Windows 脚本上报鉴权密钥
}

export type AppEnv = {
  Bindings: Bindings
}

// Windows 监控脚本上报的消息类型
export type ReportType = 'new_message' | 'process_down' | 'process_up' | 'flash_detected' | 'error'

// 上报请求体
export interface ReportPayload {
  type: ReportType
  message?: string
  title?: string     // 窗口标题（闪烁检测时附带）
  timestamp: string
}

// 心跳请求体
export interface HeartbeatPayload {
  status: 'alive'
  agiso_running: boolean
  timestamp: string
}

// 阿奇索 Webhook 推送（预留）
export interface AgisoWebhookPayload {
  type: string
  data: Record<string, unknown>
}
