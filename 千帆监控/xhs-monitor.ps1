#Requires -Version 5.1
<#
.SYNOPSIS
    小红书自动发货助手 - 新消息企微通知
.DESCRIPTION
    通过 Windows Shell Hook 监听 HSHELL_FLASH 事件，
    当"小红书自动发货助手"窗口闪烁时发送企微群通知。
.PARAMETER Secret
    Worker 上报鉴权密钥
.PARAMETER Test
    测试模式: 发送一条测试通知后退出
.PARAMETER Debug
    调试模式: 打印所有 Shell Hook 事件
#>

param(
    [string]$Secret = "",
    [switch]$Test,
    [switch]$Debug
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WORKER_URL      = "https://xhs-notify.learnbox.top"
$REPORT_SECRET   = if ($Secret) { $Secret } else { $env:XHS_REPORT_SECRET }
$WINDOW_KEYWORD  = "小红书自动发货助手"
$LOG_FORMAT      = if ($Debug) { 'HH:mm:ss.fff' } else { 'HH:mm:ss' }

if (-not $REPORT_SECRET) {
    Write-Host "[错误] 请提供上报密钥: .\xhs-monitor.ps1 -Secret 'your_secret'" -ForegroundColor Red
    exit 1
}

# ===== 加载 Windows Forms =====
Add-Type -AssemblyName System.Windows.Forms

# ===== FlashMonitor: 通过 Shell Hook 监听窗口闪烁事件 =====
$csCode = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public class FlashMonitor : Form {
    [DllImport("user32.dll")]
    private static extern bool RegisterShellHookWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool DeregisterShellHookWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern uint RegisterWindowMessage(string lpString);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc cb, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    private uint shellMsg;
    private IntPtr target = IntPtr.Zero;
    private string keyword;

    // 外部读取
    public bool HasFlash;        // 检测到新消息闪烁
    public bool TargetClosed;    // 目标窗口被关闭
    public bool TargetRestored;  // 目标窗口重新出现
    // 调试: 最近一次 Shell 事件
    public string LastEvent = "";

    public FlashMonitor(string kw) {
        keyword = kw;
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.None;
        Size = new System.Drawing.Size(1, 1);
        StartPosition = FormStartPosition.Manual;
        Location = new System.Drawing.Point(-1000, -1000);
        Opacity = 0;

        shellMsg = RegisterWindowMessage("SHELLHOOK");
        RegisterShellHookWindow(Handle);
        FindTarget();
    }

    public void FindTarget() {
        target = IntPtr.Zero;
        EnumWindows((h, _) => {
            if (!IsWindowVisible(h)) return true;
            var sb = new StringBuilder(512);
            GetWindowText(h, sb, 512);
            if (sb.ToString().IndexOf(keyword) >= 0) { target = h; return false; }
            return true;
        }, IntPtr.Zero);
    }

    public bool HasTarget() { return target != IntPtr.Zero; }

    public string TargetTitle() {
        if (target == IntPtr.Zero) return "";
        var sb = new StringBuilder(512);
        GetWindowText(target, sb, 512);
        return sb.ToString();
    }

    protected override CreateParams CreateParams {
        get {
            var cp = base.CreateParams;
            cp.ExStyle |= 0x80; // WS_EX_TOOLWINDOW: 不出现在 Alt-Tab 和任务栏
            return cp;
        }
    }

    protected override void WndProc(ref Message m) {
        if ((uint)m.Msg == shellMsg) {
            int w = m.WParam.ToInt32();
            LastEvent = string.Format("shell w=0x{0:X} lParam=0x{1:X} target=0x{2:X}", w, m.LParam.ToInt64(), target.ToInt64());

            // HSHELL_FLASH = HSHELL_REDRAW(6) | 0x8000 = 0x8006
            if (w == 0x8006 && m.LParam == target && target != IntPtr.Zero) {
                HasFlash = true;
            }
            // HSHELL_WINDOWDESTROYED = 2
            if (w == 2 && m.LParam == target && target != IntPtr.Zero) {
                TargetClosed = true;
                target = IntPtr.Zero;
            }

            // 目标丢失时，监听窗口创建(1)和重绘(6)事件，尝试重新识别
            if (target == IntPtr.Zero && (w == 1 || w == 6 || w == 4)) {
                var sb = new StringBuilder(512);
                GetWindowText(m.LParam, sb, 512);
                if (sb.ToString().IndexOf(keyword) >= 0) {
                    target = m.LParam;
                    TargetRestored = true;
                }
            }
        }
        base.WndProc(ref m);
    }

    protected override void Dispose(bool disposing) {
        DeregisterShellHookWindow(Handle);
        base.Dispose(disposing);
    }
}
"@

$ref = [System.Windows.Forms.Form].Assembly.Location
Add-Type -TypeDefinition $csCode -ReferencedAssemblies @($ref, "System.Drawing.dll")

# ===== 日志 =====
function Log([string]$Msg, [string]$Color = "White") {
    Write-Host "[$(Get-Date -Format $LOG_FORMAT)] $Msg" -ForegroundColor $Color
}

# ===== 发送通知 =====
function Send-Report([string]$Type, [string]$Message = "", [string]$Title = "") {
    try {
        $body = @{
            type      = $Type
            message   = $Message
            title     = $Title
            timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        } | ConvertTo-Json -Compress
        $resp = Invoke-RestMethod "$WORKER_URL/report" -Method POST -Body $body `
            -Headers @{ "X-Report-Secret" = $REPORT_SECRET; "Content-Type" = "application/json" } `
            -TimeoutSec 5
        Log "上报 [$Type] -> $($resp.action)" Green
        return $true
    }
    catch {
        Log "上报失败: $_" Red
        return $false
    }
}

# ===== 测试模式 =====
if ($Test) {
    Write-Host "`n===== 测试模式 =====" -ForegroundColor Cyan
    Send-Report "new_message" "测试消息 - 验证通知链路" "测试"
    Write-Host "测试完成! 请检查企微群。" -ForegroundColor Cyan
    exit 0
}

# ===== 创建 FlashMonitor =====
$monitor = New-Object FlashMonitor($WINDOW_KEYWORD)

if ($monitor.HasTarget()) {
    Log "找到窗口: $($monitor.TargetTitle())" Green
}
else {
    Log "未找到 '$WINDOW_KEYWORD' 窗口, 继续监控..." Yellow
}

# ===== 正式启动 =====
$modeLabel = if ($Debug) { " [调试版]" } else { "" }
$bannerColor = if ($Debug) { "Yellow" } else { "Cyan" }

Write-Host ""
Write-Host "========================================" -ForegroundColor $bannerColor
Write-Host "   小红书发货助手 - 消息监控$modeLabel" -ForegroundColor $bannerColor
Write-Host "========================================" -ForegroundColor $bannerColor
Write-Host "Worker:    $WORKER_URL"
Write-Host "检测方式:  Shell Hook (HSHELL_FLASH)"
Write-Host "按 Ctrl+C 停止"
Write-Host ""

$loopCount     = 0
$lastEvent     = ""
$lastNotify    = [datetime]::MinValue
$NOTIFY_COOLDOWN = 10   # 同一轮闪烁产生多次 HSHELL_FLASH，10 秒内只发 1 条
$pendingRetry  = $null  # 待重试的通知
$retryCount    = 0
$MAX_RETRIES   = 3
$wasTargetFound = $monitor.HasTarget()
$STARTUP_GRACE  = 10                 # 助手重启后 10 秒内忽略闪烁和关闭事件
$targetStableAt = [datetime]::Now.AddSeconds(-$STARTUP_GRACE - 1)  # 首次脚本启动不等待
$refreshTimer  = [datetime]::Now

# ===== 主循环 =====
while ($true) {
    # 处理 Windows 消息（接收 Shell Hook 事件）
    [System.Windows.Forms.Application]::DoEvents()

    $loopCount++

    # 重试上次失败的通知
    if ($pendingRetry) {
        $ok = Send-Report $pendingRetry.Type $pendingRetry.Message $pendingRetry.Title
        if ($ok) {
            $pendingRetry = $null; $retryCount = 0
            $lastNotify = [datetime]::Now
        }
        else {
            $retryCount++
            if ($retryCount -ge $MAX_RETRIES) {
                Log "重试 ${MAX_RETRIES} 次均失败, 放弃" Red
                $pendingRetry = $null; $retryCount = 0
            }
        }
    }

    $sinceStable = ([datetime]::Now - $targetStableAt).TotalSeconds

    # 检测到助手关闭 -> 发告警（启动期内忽略，应用初始化会重建窗口）
    if ($monitor.TargetClosed) {
        $monitor.TargetClosed = $false
        if ($sinceStable -gt $STARTUP_GRACE) {
            Log "*** 发货助手已关闭! ***" Red
            Send-Report "process_down" "小红书自动发货助手已关闭"
            $wasTargetFound = $false
        }
        elseif ($Debug) {
            Log "窗口销毁, 启动期内忽略 ($([int]$sinceStable)s/$($STARTUP_GRACE)s)" DarkGray
        }
    }

    # 检测到助手重新启动 -> 发通知 + 重置启动期
    if ($monitor.TargetRestored) {
        $monitor.TargetRestored = $false
        if (-not $wasTargetFound) {
            Log "*** 发货助手已恢复! ***" Green
            Send-Report "process_up" "小红书自动发货助手已重新启动"
        }
        $wasTargetFound = $true
        $targetStableAt = [datetime]::Now  # 重置启动期
    }

    # 检测到闪烁 -> 发通知（启动期内忽略，10 秒内只发 1 条）
    if ($monitor.HasFlash) {
        $monitor.HasFlash = $false
        if ($sinceStable -le $STARTUP_GRACE) {
            if ($Debug) { Log "闪烁事件, 启动期内忽略" DarkGray }
        }
        elseif (([datetime]::Now - $lastNotify).TotalSeconds -le $NOTIFY_COOLDOWN) {
            if ($Debug) { Log "闪烁事件, 冷却中" DarkGray }
        }
        elseif ($pendingRetry) {
            # 有待重试的通知，不发新的
        }
        else {
            $title = $monitor.TargetTitle()
            Log "*** 检测到新消息! ***" Yellow
            $ok = Send-Report "flash_detected" "检测到新消息通知" $title
            if ($ok) {
                $lastNotify = [datetime]::Now
            }
            else {
                # 发送失败，加入重试队列
                $pendingRetry = @{ Type = "flash_detected"; Message = "检测到新消息通知"; Title = $title }
                $retryCount = 1
            }
        }
    }

    # 调试模式: 打印 Shell Hook 事件
    if ($Debug -and $monitor.LastEvent -ne $lastEvent -and $monitor.LastEvent -ne "") {
        Log "Shell事件: $($monitor.LastEvent)" DarkGray
        $lastEvent = $monitor.LastEvent
    }

    # 每 30 秒刷新一次目标窗口句柄（防止窗口重建导致句柄失效）
    if (([datetime]::Now - $refreshTimer).TotalSeconds -gt 30) {
        $monitor.FindTarget()
        $refreshTimer = [datetime]::Now
        $nowFound = $monitor.HasTarget()

        if ($nowFound -and -not $wasTargetFound) {
            Log "*** 发货助手已恢复! ***" Green
            Send-Report "process_up" "小红书自动发货助手已重新启动"
        }
        elseif ($Debug) {
            $s = if ($nowFound) { "在线" } else { "未找到" }
            Log "刷新窗口: $s" DarkGray
        }

        $wasTargetFound = $nowFound
    }

    Start-Sleep -Milliseconds 100
}
