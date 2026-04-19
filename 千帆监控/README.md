# 小红书发货助手 - 企微通知系统

监控 Windows 电脑上的「小红书自动发货助手」，有新消息或异常时，自动推送企业微信群通知。

## 架构

```
Windows 电脑 (PowerShell 脚本)
    ↓ POST /heartbeat (每5分钟)
    ↓ POST /report (检测到闪烁时)
Cloudflare Worker (xhs-notify)
    ↓ 企微 Webhook API
企业微信群 (手机收通知)
```

## 功能模块

| 模块 | 触发条件 | 做什么 | 通知内容 |
|------|---------|--------|---------|
| 闪烁检测 | 发货助手任务栏闪烁 | PowerShell 检测到 → `POST /report` → 企微通知 | "新客服消息，请打开千帆回复" |
| 闪烁冷却 | 5 分钟内重复闪烁 | 客户端跳过，不上报 | 不通知 |
| 进程掉线 | 心跳上报时发货助手窗口不存在 | Worker 收到 `agiso_running=false` → 企微告警 | "发货助手已离线，请重启" |
| 心跳正常 | 每 5 分钟 | PowerShell → `POST /heartbeat` → KV 记录时间 | 不通知 |
| 脚本离线 | Cron 每 10 分钟检查，超 10 分钟无心跳 | Worker 发企微告警（1 小时内不重复） | "监控脚本离线，请检查 Windows" |
| 脚本恢复 | 之前离线，现在收到心跳了 | Worker 清除告警标记 → 企微通知 | "监控脚本已恢复" |
| 去重 | 同类型通知 5 分钟内 | Worker 端 KV 去重，不重复发 | 不通知 |
| 限流 | 每分钟超 15 条 | Worker 端丢弃，防刷屏 | 不通知 |
| 阿奇索 Webhook | 预留，未启用 | `POST /webhook/agiso`，等确认小红书是否支持 | — |

## 告警场景

| 场景 | 企微消息 | 需要做什么 |
|------|---------|-----------|
| 买家发消息 | 💬 新客服消息 | 打开千帆 APP 回复 |
| 发货助手挂了 | 🔴 发货助手已离线 | 远程桌面重启发货助手 |
| Windows 关机/脚本挂了 | ⚠️ 监控脚本离线 | 检查 Windows 电脑 |
| 脚本恢复正常 | ✅ 监控脚本已恢复 | 不用管 |

## 资源消耗 (每日)

| 资源 | 用量 | 免费额度 |
|------|------|---------|
| Workers 请求 | ~430 次 | 10 万次/天 |
| KV 读取 | ~430 次 | 10 万次/天 |
| KV 写入 | ~290 次 | 1000 次/天 |
| Cron 触发 | 144 次 | 不限 |

## 项目结构

```
xhs-notify-worker/
├── src/
│   ├── index.ts                # 入口: Hono 路由 + Cron 心跳检查
│   ├── types.ts                # 类型定义
│   ├── routes/
│   │   ├── monitor-report.ts   # POST /report + POST /heartbeat
│   │   └── agiso-webhook.ts    # POST /webhook/agiso (预留)
│   └── services/
│       ├── wecom.ts            # 企微群机器人消息发送
│       ├── dedup.ts            # KV 去重 + 限流
│       └── formatter.ts        # 通知消息格式化模板
├── xhs-monitor.ps1             # Windows 监控脚本 (PowerShell)
├── wrangler.jsonc              # Cloudflare Workers 配置
├── package.json
└── tsconfig.json
```

## API 接口

### POST /report

Windows 脚本上报事件（新消息、进程掉线、异常等）。

**Headers:**
- `X-Report-Secret`: 鉴权密钥

**Body:**
```json
{
  "type": "flash_detected",
  "message": "检测到新消息通知",
  "timestamp": "2026-03-08 14:30:00"
}
```

| type | 含义 |
|------|------|
| `new_message` | 新客服消息 |
| `flash_detected` | 任务栏闪烁 |
| `process_down` | 发货助手进程掉线 |
| `error` | 发货异常 |

**Response:**
```json
{ "ok": true, "action": "sent" }       // 已发送通知
{ "ok": true, "action": "deduped" }    // 去重跳过
{ "ok": true, "action": "rate_limited" } // 限流跳过
```

### POST /heartbeat

Windows 脚本心跳上报。

**Headers:**
- `X-Report-Secret`: 鉴权密钥

**Body:**
```json
{
  "status": "alive",
  "agiso_running": true,
  "timestamp": "2026-03-08 14:30:00"
}
```

### POST /webhook/agiso

预留：接收阿奇索开放平台 tradePush 订单推送。

### GET /health

健康检查，返回 `{ "ok": true, "service": "xhs-notify" }`。

## 部署

### Worker 部署

```bash
cd /Users/dong/Desktop/115科技AI开发/xhs-notify-worker

# 设置 Secrets (首次)
npx wrangler secret put WECOM_WEBHOOK_KEY    # 企微群机器人 webhook key
npx wrangler secret put REPORT_SECRET        # Windows 脚本上报鉴权密钥

# 部署
npx wrangler deploy
```

### Windows 监控脚本

将 `xhs-monitor.ps1` 拷贝到 Windows 电脑，运行：

```powershell
# 测试链路
.\xhs-monitor.ps1 -Secret "你的密钥" -Test

# 正式运行
.\xhs-monitor.ps1 -Secret "你的密钥"
```

### 开机自启 (计划任务)

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File C:\xhs-monitor\xhs-monitor.ps1 -Secret 'your_secret'"

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "XhsMonitor" -Action $action -Trigger $trigger -Settings $settings -Description "小红书发货助手消息监控"
```

## 配置项

### Worker 环境变量 (Secrets)

| 变量 | 用途 |
|------|------|
| `WECOM_WEBHOOK_KEY` | 企微群机器人 webhook key |
| `REPORT_SECRET` | Windows 脚本上报鉴权密钥 |

### Worker KV

| Binding | 用途 |
|---------|------|
| `KV` | 存储心跳时间、去重标记、限流计数 |

### 自定义域名

| 域名 | 用途 |
|------|------|
| `xhs-notify.learnbox.top` | Worker 访问入口 |
