// 去重与限流服务

/** 检查是否重复通知（5 分钟内同类型不重复发） */
export async function isDuplicate(kv: KVNamespace, type: string): Promise<boolean> {
  const key = `dedup:${type}`
  const existing = await kv.get(key)
  if (existing) return true
  await kv.put(key, '1', { expirationTtl: 300 }) // 5 分钟过期
  return false
}

/** 检查当前分钟是否超过限流阈值（15 条/分） */
export async function isRateLimited(kv: KVNamespace): Promise<boolean> {
  const minute = new Date().toISOString().slice(0, 16) // 精确到分钟
  const key = `rate:${minute}`
  const count = parseInt(await kv.get(key) || '0')
  if (count >= 15) return true
  await kv.put(key, String(count + 1), { expirationTtl: 120 })
  return false
}

/** 记录心跳时间 */
export async function updateHeartbeat(kv: KVNamespace, agisoRunning: boolean): Promise<void> {
  await kv.put('heartbeat:last', JSON.stringify({
    time: new Date().toISOString(),
    agiso_running: agisoRunning,
  }))
}

/** 获取上次心跳信息 */
export async function getLastHeartbeat(kv: KVNamespace): Promise<{ time: string; agiso_running: boolean } | null> {
  const data = await kv.get('heartbeat:last')
  if (!data) return null
  return JSON.parse(data)
}
