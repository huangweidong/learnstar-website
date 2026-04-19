#!/usr/bin/env node
'use strict'

/**
 * 小红书搜索结果采集工具 - Puppeteer 版本
 *
 * 流程：
 *   1. 启动 Chrome → 打开小红书 → 用户登录、搜索、筛选排序
 *   2. 60 秒倒计时后自动开始采集
 *   3. 逐篇点击笔记卡片 → 弹层打开 → 提取数据 → 关闭弹层 → 下一篇
 *   4. 当前视图没有新卡片时，自动滚动加载更多
 *   5. 采集完成后浏览器保持打开
 *
 * 用法：
 *   node collect.js              # 默认采集 20 篇
 *   node collect.js -n 50        # 采集 50 篇
 */

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const http = require('http')

// ====== 配置 ======
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
]
const PROFILE_DIR = path.join(__dirname, '.chrome-profile')
const DOWNLOAD_BASE = path.join(os.homedir(), 'Downloads', 'xhs_collect')
const COUNTDOWN = 20
const NOTE_LINK_SEL = 'a[href*="/explore/"], a[href*="/discovery/item/"]'

// ====== 工具函数 ======
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function getExt(url) {
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].includes(ext)) return ext
  } catch {}
  return 'jpg'
}

function findChrome(customPath) {
  if (customPath) {
    if (fs.existsSync(customPath)) return customPath
    console.error(`Chrome 路径不存在: ${customPath}`)
    process.exit(1)
  }
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p
  }
  console.error('未找到 Chrome，请用 --chrome 指定路径')
  process.exit(1)
}

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const doRequest = (targetUrl, redirects = 0) => {
      if (redirects > 5) {
        reject(new Error('过多重定向'))
        return
      }
      const lib = targetUrl.startsWith('https') ? https : http
      lib
        .get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Referer': 'https://www.xiaohongshu.com/' } }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            doRequest(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          const stream = fs.createWriteStream(filePath)
          res.pipe(stream)
          stream.on('finish', resolve)
          stream.on('error', reject)
        })
        .on('error', reject)
    }
    doRequest(url)
  })
}

// ====== 参数解析 ======
function parseArgs() {
  const argv = process.argv.slice(2)
  const args = { count: 20, chrome: '' }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--count':
      case '-n':
        args.count = parseInt(argv[++i]) || 20
        break
      case '--chrome':
        args.chrome = argv[++i] || ''
        break
      case '--help':
      case '-h':
        console.log('用法: node collect.js [-n 数量] [--chrome Chrome路径]')
        process.exit(0)
    }
  }
  return args
}

// ====== 查找下一个未处理的笔记卡片 ======
async function findNextCard(page, doneIds) {
  return page.evaluate((done) => {
    const doneSet = new Set(done)
    // XHS 搜索页每张卡片有一个 display:none 的隐藏链接，从中提取 noteId
    const links = document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/item/"]')

    for (const a of links) {
      const m = a.href.match(/\/(explore|discovery\/item)\/([a-zA-Z0-9]+)/)
      if (!m) continue
      const noteId = m[2]
      if (doneSet.has(noteId)) continue

      // 移除所有相关链接的 target
      document.querySelectorAll(`a[href*="${noteId}"]`).forEach((l) => l.removeAttribute('target'))

      return { noteId }
    }

    return { noteId: null }
  }, Array.from(doneIds))
}

// ====== 滚动到卡片并点击 ======
async function scrollToAndClick(page, noteId) {
  // 从隐藏链接向上找到可见的卡片容器，再点击封面图
  await page.evaluate((nid) => {
    const link = document.querySelector(`a[href*="${nid}"]`)
    if (!link) return

    // 向上找第一个有尺寸的祖先（即卡片容器）
    let el = link
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect()
      if (r.width > 50 && r.height > 50) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      el = el.parentElement
    }
  }, noteId)
  await sleep(800)

  // 获取卡片内封面图的坐标
  const pos = await page.evaluate((nid) => {
    const link = document.querySelector(`a[href*="${nid}"]`)
    if (!link) return null

    // 向上找卡片容器
    let card = link
    while (card && card !== document.body) {
      const r = card.getBoundingClientRect()
      if (r.width > 50 && r.height > 50) break
      card = card.parentElement
    }
    if (!card || card === document.body) return null

    // 优先点击封面图
    const img = card.querySelector('img')
    if (img) {
      const r = img.getBoundingClientRect()
      if (r.width > 10 && r.height > 10) {
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
      }
    }

    // 兜底：点击卡片本身
    const r = card.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  }, noteId)

  if (!pos) throw new Error('卡片不可见')

  await page.mouse.click(pos.x, pos.y)
}

// ====== 从弹层中提取笔记数据 ======
async function extractNoteData(page, noteId) {
  // 方法 1：SSR state
  let data = await page.evaluate((nid) => {
    try {
      const state = window.__INITIAL_STATE__ || window.__INITIAL_SSR_STATE__
      if (!state?.note?.noteDetailMap) return null

      let entry = state.note.noteDetailMap[nid]
      if (!entry?.note) {
        const keys = Object.keys(state.note.noteDetailMap)
        if (keys.length) entry = state.note.noteDetailMap[keys[keys.length - 1]]
      }
      if (!entry?.note) return null

      const note = entry.note
      const isVideo = note.type === 'video'

      function cleanUrl(raw) {
        if (!raw) return ''
        try {
          const u = new URL(raw.startsWith('//') ? 'https:' + raw : raw)
          return u.origin + u.pathname
        } catch {
          return raw.split('?')[0]
        }
      }

      // 提取图片列表（图文笔记）
      const images = (note.imageList || note.image_list || [])
        .map((img) => {
          let url = ''
          if (img.info_list?.length) {
            const pick =
              img.info_list.find((i) => i.image_scene === 'WB_DFT') ||
              img.info_list.find((i) => i.image_scene === 'CRD_WM_WEBP') ||
              img.info_list[0]
            url = pick?.url || ''
          }
          if (!url) url = img.url_default || img.url_pre || img.url || img.urlDefault || ''
          return cleanUrl(url)
        })
        .filter(Boolean)

      // 视频笔记：提取封面图
      if (isVideo && !images.length) {
        const cover = note.video?.cover?.url
          || note.video?.image?.url
          || note.video?.firstFrameUrl
          || note.cover?.url
          || note.imageList?.[0]?.url
          || note.image_list?.[0]?.url
          || ''
        const cleaned = cleanUrl(cover)
        if (cleaned) images.push(cleaned)
      }

      return {
        noteId: nid,
        title: note.title || '',
        desc: note.desc || '',
        images,
        isVideo,
        userName: note.user?.nickname || '',
        userId: note.user?.userId || note.user?.user_id || '',
        tags: (note.tagList || note.tag_list || []).map((t) => t.name || t).filter(Boolean),
        _debug: { type: note.type, imgListLen: (note.imageList || note.image_list || []).length, keys: Object.keys(note).slice(0, 20) },
      }
    } catch {}
    return null
  }, noteId)

  if (data) return data

  // 方法 2：DOM 抓取
  data = await page.evaluate((nid) => {
    try {
      const container =
        document.querySelector(
          '.note-detail-mask, [class*="note-detail"], [id*="noteContainer"], [class*="noteDetail"]',
        ) || document.body

      // 从多个候选选择器中取第一个有内容的
      function firstText(root, sels) {
        for (const sel of sels) {
          const el = root.querySelector(sel)
          if (el?.textContent?.trim()) return el.textContent.trim()
        }
        return ''
      }

      const images = []
      const seen = new Set()
      for (const img of container.querySelectorAll('img')) {
        const src = img.src || ''
        if (!src.includes('xhscdn.com') && !src.includes('ci.xiaohongshu.com')) continue
        if (img.closest('[class*="avatar"]')) continue
        if (img.width > 0 && img.width < 80) continue
        let cleaned = src.split('?')[0]
        if (cleaned.startsWith('//')) cleaned = 'https:' + cleaned
        if (!seen.has(cleaned)) {
          seen.add(cleaned)
          images.push(cleaned)
        }
      }
      if (!images.length) return null

      const title = firstText(container, ['#detail-title', '[class*="title"]', '.title'])
      const desc = firstText(container, ['#detail-desc', '[class*="desc"]', '[class*="note-text"]', '.content'])
      const userName = firstText(container, ['.user-name', '[class*="nickname"]', '.username', '[class*="author"]'])

      const tags = []
      for (const el of container.querySelectorAll(
        '[class*="tag"] a, [class*="hash-tag"], a[href*="/search_result"]',
      )) {
        const text = el.textContent?.trim()?.replace(/^#/, '')
        if (text && !tags.includes(text)) tags.push(text)
      }

      return { noteId: nid, title, desc, images, userName, userId: '', tags }
    } catch {}
    return null
  }, noteId)

  return data
}

// ====== 关闭弹层，返回列表 ======
async function closeModal(page, originalUrl) {
  await page.keyboard.press('Escape')
  await sleep(2000)

  // Escape 没关闭 → goBack
  if (page.url() !== originalUrl) {
    await page.goBack({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
    await sleep(2000)
  }

  // 还没回去 → 直接导航回列表
  if (page.url() !== originalUrl) {
    await page.goto(originalUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    await sleep(2000)
  }

  // 等待列表 DOM 恢复（虚拟滚动需要时间重建）
  for (let i = 0; i < 8; i++) {
    const count = await page
      .evaluate((sel) => document.querySelectorAll(sel).length, NOTE_LINK_SEL)
      .catch(() => 0)
    if (count > 0) return
    await sleep(1000)
  }
}

// ====== 保存笔记到磁盘 ======
async function saveNote(noteData, noteId) {
  const author = sanitize(noteData.userName || 'unknown')
  const title = sanitize(noteData.title || noteId)
  const noteDir = path.join(DOWNLOAD_BASE, author, `${noteId}_${title}`)

  fs.mkdirSync(noteDir, { recursive: true })
  const results = await Promise.allSettled(
    noteData.images.map((url, i) => {
      const fullUrl = url.startsWith('http') ? url : 'https:' + url
      const ext = getExt(fullUrl)
      const filePath = path.join(noteDir, `img_${String(i + 1).padStart(2, '0')}.${ext}`)
      return downloadFile(fullUrl, filePath)
    }),
  )
  let imgOk = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') imgOk++
    else process.stdout.write(`[!图${i + 1}] `)
  })

  const lines = [
    `标题：${noteData.title}`,
    `作者：${noteData.userName}`,
    `笔记ID：${noteId}`,
    `链接：https://www.xiaohongshu.com/explore/${noteId}`,
  ]
  if (noteData.tags?.length) lines.push(`标签：${noteData.tags.map((t) => '#' + t).join(' ')}`)
  lines.push('', '---', '', noteData.desc || '')

  fs.writeFileSync(path.join(noteDir, '内容.txt'), lines.join('\n'), 'utf-8')

  return imgOk
}

// ====== 主流程 ======
async function main() {
  const args = parseArgs()
  const chromePath = findChrome(args.chrome)

  console.log(`\n  采集数量: ${args.count}`)
  console.log(`  保存目录: ${DOWNLOAD_BASE}`)
  console.log(`  Chrome: ${chromePath}\n`)

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: null,
    userDataDir: PROFILE_DIR,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--start-maximized',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  })
  console.log('[OK] Chrome 已启动\n')

  process.on('SIGINT', () => {
    console.log('\n\n[STOP] 用户中断，浏览器保持打开')
    browser.disconnect()
    process.exit(0)
  })

  try {
    const pages = await browser.pages()
    const page = pages[0] || (await browser.newPage())
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle2', timeout: 60000 })

    console.log('='.repeat(50))
    console.log('  请在浏览器中操作：')
    console.log('  1. 扫码登录（已登录则跳过）')
    console.log('  2. 搜索关键词')
    console.log('  3. 设置排序（如：最多点赞）')
    console.log(`  ${COUNTDOWN} 秒后自动开始采集`)
    console.log('='.repeat(50))
    console.log('')

    // 60 秒倒计时
    for (let i = COUNTDOWN; i > 0; i--) {
      process.stdout.write(`\r  倒计时 ${i} 秒...  `)
      await sleep(1000)
    }
    console.log('\r  倒计时结束，准备采集...            \n')

    // 查找有笔记卡片的页面
    let workPage = null
    for (let retry = 0; retry < 10; retry++) {
      const allPages = await browser.pages()
      for (const p of allPages) {
        try {
          const url = p.url()
          if (!url.includes('xiaohongshu.com')) continue
          const count = await p
            .evaluate((sel) => document.querySelectorAll(sel).length, NOTE_LINK_SEL)
            .catch(() => 0)
          if (count >= 1) {
            workPage = p
            console.log(`[OK] 找到页面，${count} 个笔记链接\n`)
            break
          }
        } catch {}
      }
      if (workPage) break
      console.log(`  未检测到笔记，${3}秒后重试... (${retry + 1}/10)`)
      await sleep(3000)
    }

    if (!workPage) {
      console.log('\n[FAIL] 未找到包含笔记的页面')
      return
    }

    // ====== 采集循环 ======
    const listUrl = workPage.url()
    const doneIds = new Set()
    let ok = 0,
      fail = 0
    let scrollRetries = 0

    console.log('[...] 开始逐篇采集...\n')

    while (ok < args.count) {
      const result = await findNextCard(workPage, doneIds)

      if (!result?.noteId) {
        // 所有卡片都已处理，滚动加载更多
        scrollRetries++
        if (scrollRetries > 8) {
          console.log('\n  没有更多笔记了')
          break
        }
        console.log(`  无新卡片，滚动加载... (${scrollRetries}/8)`)
        await workPage.evaluate(() => window.scrollBy(0, window.innerHeight * 2))
        await sleep(3000)
        continue
      }

      scrollRetries = 0
      const noteId = result.noteId
      doneIds.add(noteId)
      const idx = ok + 1
      process.stdout.write(`[${idx}/${args.count}] ${noteId} ... `)

      try {
        const beforeUrl = workPage.url()

        // 点击卡片封面
        await scrollToAndClick(workPage, noteId)

        // 等待 URL 变化（弹层打开）
        let urlChanged = false
        for (let w = 0; w < 10; w++) {
          await sleep(500)
          if (workPage.url() !== beforeUrl) {
            urlChanged = true
            break
          }
        }

        if (!urlChanged) {
          console.log('弹层未出现，跳过')
          fail++
          continue
        }

        // 等待内容渲染
        await sleep(3000)

        // 提取数据（弹层打开状态下提取）
        let noteData = await extractNoteData(workPage, noteId)

        // 首次失败则等 3 秒重试
        if (!noteData || (!noteData._isVideo && !noteData.images?.length)) {
          await sleep(3000)
          noteData = await extractNoteData(workPage, noteId)
        }

        // 关闭弹层，回到列表
        await closeModal(workPage, beforeUrl)

        // 处理结果
        if (!noteData) {
          console.log('提取失败')
          fail++
        } else if (noteData.isVideo && !noteData.images?.length) {
          // 视频笔记且无封面图：保存文案
          await saveNote(noteData, noteId)
          ok++
          console.log(
            `OK (视频,仅文案) | ${noteData.userName || '?'} | ${noteData.title?.slice(0, 30) || ''}`,
          )
          if (noteData._debug) console.log(`  [debug] ${JSON.stringify(noteData._debug)}`)
        } else if (!noteData.images?.length) {
          console.log('提取失败(无图片)')
          if (noteData._debug) console.log(`  [debug] ${JSON.stringify(noteData._debug)}`)
          fail++
        } else {
          const imgCount = await saveNote(noteData, noteId)
          ok++
          console.log(
            `OK ${imgCount}张图 | ${noteData.userName || '?'} | ${noteData.title?.slice(0, 30) || ''}`,
          )
          if (noteData._debug) console.log(`  [debug] ${JSON.stringify(noteData._debug)}`)
        }
      } catch (e) {
        console.log(`错误: ${e.message}`)
        fail++
        // 确保回到列表页
        try {
          if (workPage.url() !== listUrl) {
            await workPage.goBack({ timeout: 10000 }).catch(() => {})
            await sleep(2000)
          }
        } catch {}
      }

      // 随机等待 5-10 秒
      if (ok < args.count) {
        const delay = 5000 + Math.random() * 5000
        console.log(`  等待 ${(delay / 1000).toFixed(1)}s...`)
        await sleep(delay)
      }
    }

    // ====== 完成 ======
    console.log(`\n${'='.repeat(50)}`)
    console.log(`  已完成采集✔️✔️✔️✔️`)
    console.log(`  成功: ${ok} | 失败: ${fail}`)
    console.log(`  保存位置: ${DOWNLOAD_BASE}`)
    console.log('='.repeat(50))
  } finally {
    console.log('\n  浏览器保持打开，你可以继续使用。')
    browser.disconnect()
  }
}

main().catch((e) => {
  console.error('[FAIL]', e.message)
  process.exit(1)
})
