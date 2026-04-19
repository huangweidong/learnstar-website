(function () {
  'use strict'

  // ======== 配置 ========
  const STORAGE_KEY = 'xhs-hl-threshold'
  const HL_ATTR = 'data-xhs-hl'
  const FOCUS_ATTR = 'data-xhs-focus'
  const PANEL_ID = 'xhs-hl-panel'
  const FOUND_MAP_MAX = 2000

  let threshold = 1000
  let enabled = true
  let collapsed = false
  let navIndex = -1

  // 累计匹配记录（key = noteId，value = { num, text }）
  // 即使卡片被虚拟滚动移除，记录仍保留
  const foundMap = new Map()

  // ======== 工具函数 ========

  function parseCount(text) {
    if (!text) return NaN
    text = text.trim().replace(/,/g, '').replace(/\s+/g, '')
    let m
    if ((m = text.match(/^(\d+\.?\d*)万\+?$/))) return Math.round(parseFloat(m[1]) * 10000)
    if ((m = text.match(/^(\d+)\+?$/))) return parseInt(m[1], 10)
    return NaN
  }

  function formatCount(num) {
    if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万'
    return num.toLocaleString()
  }

  // 从各种 URL 格式中提取 noteId（24位十六进制）
  // /explore/ID, /note/ID, /discovery/ID, /search_result/ID, /user/profile/UID/ID
  const NOTE_ID_RE = /\/(?:explore|note|discovery|search_result)\/([a-f0-9]{18,30})|\/user\/profile\/[^/?]+\/([a-f0-9]{18,30})/

  function extractNoteId(url) {
    const m = url && url.match(NOTE_ID_RE)
    return m ? (m[1] || m[2]) : null
  }

  // 卡片中所有可能包含 noteId 的链接选择器
  const ANY_NOTE_LINK_SEL = 'a[href*="/explore/"], a[href*="/note/"], a[href*="/discovery/"], a[href*="/search_result/"], a[href*="/user/profile/"]'
  const NOTE_HREF_RE = /\/(explore|discovery|search_result|note)\//

  function findCard(el) {
    let cur = el
    let fallback = null
    for (let i = 0; i < 15; i++) {
      cur = cur.parentElement
      if (!cur || cur === document.body) return fallback
      const cls = typeof cur.className === 'string' ? cur.className.toLowerCase() : ''
      const tag = cur.tagName
      if (/note-item|feed-item|note-card|cover-card/.test(cls)) return cur
      if (tag === 'SECTION' && cur.querySelector('a')) return cur
      if (tag === 'A' && cur.href && NOTE_HREF_RE.test(cur.href)) return cur
      // 回退候选：记录但不立即返回，优先让 regex/tag 匹配找到正确卡片
      if (!fallback && i >= 2 && i <= 7) {
        const links = cur.querySelectorAll(ANY_NOTE_LINK_SEL)
        if (links.length >= 1 && links.length <= 3) fallback = cur
        if (links.length > 3) return fallback
      }
    }
    return fallback
  }

  // 从卡片中提取 noteId
  function getCardNoteId(card) {
    // 优先从 /explore/ 等链接取
    const links = card.querySelectorAll('a[href]')
    for (const a of links) {
      const id = extractNoteId(a.href)
      if (id) return id
    }
    if (card.tagName === 'A') return extractNoteId(card.href)
    return null
  }

  function getHighlightedCards() {
    return Array.from(document.querySelectorAll(`[${HL_ATTR}]`))
  }

  // ======== 导航 ========

  function navigateTo(direction) {
    const cards = getHighlightedCards().filter(c => {
      const r = c.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (cards.length === 0) return

    document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach(c => {
      c.removeAttribute(FOCUS_ATTR)
      c.style.outline = 'none'
    })

    if (direction === 'next') {
      navIndex = (navIndex + 1) % cards.length
    } else {
      navIndex = navIndex <= 0 ? cards.length - 1 : navIndex - 1
    }

    const target = cards[navIndex]
    if (!target) return

    target.setAttribute(FOCUS_ATTR, '1')
    target.style.outline = '4px solid #FFD700'
    target.style.outlineOffset = '6px'
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })

    updateNavInfo()
  }

  function updateNavInfo() {
    const el = document.getElementById('xhs-hl-nav-info')
    const inDom = getHighlightedCards().length
    if (el) el.textContent = navIndex >= 0 ? `${navIndex + 1} / ${inDom}` : `0 / ${inDom}`
  }

  // ======== 高亮 / 清除 ========

  function applyHighlight(card) {
    card.setAttribute(HL_ATTR, '1')
    card.style.boxShadow = '0 0 0 4px #ff2442, 0 0 20px rgba(255,36,66,0.45)'
    card.style.borderRadius = '12px'
  }

  function clearAllHighlights() {
    document.querySelectorAll(`[${HL_ATTR}]`).forEach(card => {
      card.removeAttribute(HL_ATTR)
      card.removeAttribute(FOCUS_ATTR)
      card.style.removeProperty('box-shadow')
      card.style.removeProperty('border-radius')
      card.style.removeProperty('outline')
      card.style.removeProperty('outline-offset')
    })
  }

  // ======== 核心扫描 ========

  function incrementalScan() {
    observer.disconnect()

    if (!enabled) {
      startObserver()
      return
    }

    document.querySelectorAll('span.count, span, em').forEach(el => {
      if (el.closest('#' + PANEL_ID)) return

      const text = el.textContent.trim()
      if (text.length === 0 || text.length > 10) return
      if (el.children.length > 3) return

      const num = parseCount(text)
      if (isNaN(num) || num < threshold) return

      // 宽松上下文检查（向上 4 层）
      let hasContext = false
      let ancestor = el
      for (let lvl = 0; lvl < 4; lvl++) {
        ancestor = ancestor.parentElement
        if (!ancestor) break
        if (ancestor.querySelector('svg')) { hasContext = true; break }
        const cls = typeof ancestor.className === 'string' ? ancestor.className : ''
        if (/like|heart|engage|interact|count|footer|author|wrapper/i.test(cls)) { hasContext = true; break }
        const sibText = ancestor.textContent || ''
        if (/[♡♥❤🤍💜💛💙💚🧡🖤🩷🩵🩶❣💗💖💝💞💟☆★]/u.test(sibText.replace(text, ''))) { hasContext = true; break }
      }

      const card = findCard(el)
      if (!card) return
      if (!hasContext && num < 100) return
      if (card.hasAttribute(HL_ATTR)) return
      if (card.closest(`[${HL_ATTR}]`)) return

      const noteId = getCardNoteId(card)
      if (noteId) {
        foundMap.set(noteId, { num, text: formatCount(num) })
        if (foundMap.size > FOUND_MAP_MAX) {
          foundMap.delete(foundMap.keys().next().value)
        }
      }

      applyHighlight(card)
    })

    reapplyFromMap()
    updateUI()
    startObserver()
  }

  // 根据 foundMap 对当前 DOM 中的卡片重新应用高亮
  // 查找所有笔记链接（包括 /explore/ 和 /user/profile/UID/NID），提取 noteId 匹配
  function reapplyFromMap() {
    if (foundMap.size === 0) return

    document.querySelectorAll(ANY_NOTE_LINK_SEL).forEach(a => {
      const noteId = extractNoteId(a.href)
      if (!noteId) return

      const record = foundMap.get(noteId)
      if (!record || record.num < threshold) return

      const card = findCard(a) || a
      if (card.hasAttribute(HL_ATTR)) return
      if (card.closest(`[${HL_ATTR}]`)) return

      applyHighlight(card)
    })
  }

  // 全量扫描：清除一切，重新开始（切换阈值时用）
  function fullScan() {
    clearAllHighlights()
    foundMap.clear()
    navIndex = -1
    incrementalScan()
  }

  function updateUI() {
    let totalAbove = 0
    foundMap.forEach(r => { if (r.num >= threshold) totalAbove++ })

    const inDom = getHighlightedCards().length
    const countEl = document.getElementById('xhs-hl-count')
    if (countEl) {
      if (totalAbove > inDom) {
        countEl.textContent = `已高亮：${inDom} 篇（累计发现 ${totalAbove} 篇）`
      } else {
        countEl.textContent = `已高亮：${inDom} 篇`
      }
    }
    updateNavInfo()
  }

  // ======== 浮动面板 ========

  const PILL_STYLE = 'background:#fff5f5;color:#ff2442;border:1px solid #ffe0e0;border-radius:8px;cursor:pointer;'
  const BTN_STYLE = `display:flex;align-items:center;justify-content:center;width:36px;height:28px;${PILL_STYLE}font-size:16px;font-weight:700;transition:background 0.15s;user-select:none;`

  function addHoverEffect(el) {
    el.onmouseover = () => { el.style.background = '#ffe0e0' }
    el.onmouseout = () => { el.style.background = '#fff5f5' }
  }

  function createPanel() {
    const panel = document.createElement('div')
    panel.id = PANEL_ID
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '999999',
      background: '#fff',
      border: '1px solid #f0f0f0',
      borderRadius: '14px',
      padding: '14px 18px',
      fontSize: '14px',
      fontFamily: '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif',
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
      userSelect: 'none',
      minWidth: '220px',
    })

    panel.innerHTML = `
      <div id="xhs-hl-header" style="display:flex;align-items:center;justify-content:space-between;cursor:move;margin-bottom:10px;">
        <span style="font-weight:700;font-size:15px;">🔥 点赞高亮</span>
        <span id="xhs-hl-collapse" style="cursor:pointer;font-size:20px;color:#bbb;line-height:1;padding:0 2px;">−</span>
      </div>
      <div id="xhs-hl-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="color:#888;font-size:13px;white-space:nowrap;">≥</span>
          <input type="number" id="xhs-hl-input" value="${threshold}" min="0" step="100"
            style="width:80px;padding:5px 8px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;
                   outline:none;text-align:center;transition:border-color 0.2s;"
            onfocus="this.style.borderColor='#ff2442'" onblur="this.style.borderColor='#e0e0e0'">
          <button id="xhs-hl-apply"
            style="padding:5px 16px;background:#ff2442;color:#fff;border:none;border-radius:8px;
                   cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;">
            应用
          </button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <button class="xhs-hl-preset" data-val="500"
            style="flex:1;padding:5px 0;${PILL_STYLE}font-size:12px;font-weight:600;">500+</button>
          <button class="xhs-hl-preset" data-val="1000"
            style="flex:1;padding:5px 0;${PILL_STYLE}font-size:12px;font-weight:600;">1k+</button>
          <button class="xhs-hl-preset" data-val="5000"
            style="flex:1;padding:5px 0;${PILL_STYLE}font-size:12px;font-weight:600;">5k+</button>
          <button class="xhs-hl-preset" data-val="10000"
            style="flex:1;padding:5px 0;${PILL_STYLE}font-size:12px;font-weight:600;">1w+</button>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px;
                    padding:8px 0;border-top:1px solid #f5f5f5;border-bottom:1px solid #f5f5f5;">
          <button id="xhs-hl-prev" style="${BTN_STYLE}" title="上一个 (↑/k)">▲</button>
          <span id="xhs-hl-nav-info" style="font-size:13px;color:#666;font-weight:600;min-width:50px;text-align:center;">0 / 0</span>
          <button id="xhs-hl-next" style="${BTN_STYLE}" title="下一个 (↓/j)">▼</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span id="xhs-hl-count" style="font-size:12px;color:#999;">已高亮：0 篇</span>
          <button id="xhs-hl-toggle"
            style="padding:3px 12px;background:#f5f5f5;color:#666;border:none;border-radius:6px;cursor:pointer;font-size:12px;">
            关闭
          </button>
        </div>
      </div>
    `
    document.body.appendChild(panel)

    document.getElementById('xhs-hl-apply').onclick = () => {
      threshold = parseInt(document.getElementById('xhs-hl-input').value) || 0
      saveThreshold()
      enabled = true
      document.getElementById('xhs-hl-toggle').textContent = '关闭'
      fullScan()
    }

    document.getElementById('xhs-hl-input').onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('xhs-hl-apply').click()
    }

    panel.querySelectorAll('.xhs-hl-preset').forEach(btn => {
      addHoverEffect(btn)
      btn.onclick = () => {
        threshold = parseInt(btn.dataset.val)
        document.getElementById('xhs-hl-input').value = threshold
        saveThreshold()
        enabled = true
        document.getElementById('xhs-hl-toggle').textContent = '关闭'
        fullScan()
      }
    })

    const prevBtn = document.getElementById('xhs-hl-prev')
    const nextBtn = document.getElementById('xhs-hl-next')
    addHoverEffect(prevBtn)
    addHoverEffect(nextBtn)
    prevBtn.onclick = () => navigateTo('prev')
    nextBtn.onclick = () => navigateTo('next')

    document.getElementById('xhs-hl-toggle').onclick = () => {
      enabled = !enabled
      document.getElementById('xhs-hl-toggle').textContent = enabled ? '关闭' : '开启'
      if (enabled) {
        fullScan()
      } else {
        clearAllHighlights()
        foundMap.clear()
        navIndex = -1
        updateUI()
      }
    }

    document.getElementById('xhs-hl-collapse').onclick = () => {
      collapsed = !collapsed
      document.getElementById('xhs-hl-body').style.display = collapsed ? 'none' : 'block'
      document.getElementById('xhs-hl-collapse').textContent = collapsed ? '+' : '−'
      panel.style.minWidth = collapsed ? 'auto' : '220px'
    }

    makeDraggable(panel, document.getElementById('xhs-hl-header'))

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (!enabled) return
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); navigateTo('prev') }
      else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); navigateTo('next') }
    })
  }

  function makeDraggable(panel, handle) {
    let sx, sy, sr, sb
    const onMove = (e) => {
      panel.style.right = Math.max(0, sr - (e.clientX - sx)) + 'px'
      panel.style.bottom = Math.max(0, sb - (e.clientY - sy)) + 'px'
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    handle.onmousedown = (e) => {
      if (e.target.id === 'xhs-hl-collapse') return
      sx = e.clientX; sy = e.clientY
      sr = parseInt(panel.style.right); sb = parseInt(panel.style.bottom)
      e.preventDefault()
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }

  function saveThreshold() {
    try { localStorage.setItem(STORAGE_KEY, threshold) } catch { /* ignore */ }
  }

  function loadThreshold() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) threshold = parseInt(saved) || 1000
    } catch { /* ignore */ }
  }

  // ======== MutationObserver + Scroll + 定时器 ========

  let scanTimer
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer)
    scanTimer = setTimeout(incrementalScan, 600)
  })

  function startObserver() {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  let scrollScanTimer
  let scrollLastScan = 0
  function onScrollCapture() {
    if (!enabled) return
    const now = Date.now()
    clearTimeout(scrollScanTimer)
    if (now - scrollLastScan >= 500) {
      scrollLastScan = now
      incrementalScan()
    } else {
      scrollScanTimer = setTimeout(() => {
        scrollLastScan = Date.now()
        incrementalScan()
      }, 500)
    }
  }

  // ======== 初始化 ========

  function init() {
    loadThreshold()
    createPanel()
    setTimeout(incrementalScan, 1000)
    startObserver()
    window.addEventListener('scroll', onScrollCapture, { passive: true, capture: true })

    // 兜底：每 2 秒检查一次，处理虚拟滚动重建的卡片
    // （scroll/MutationObserver 可能漏掉卡片重建）
    setInterval(() => {
      if (enabled && foundMap.size > 0) {
        reapplyFromMap()
        updateUI()
      }
    }, 2000)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    setTimeout(init, 500)
  }
})()
