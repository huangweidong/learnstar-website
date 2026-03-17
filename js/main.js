/**
 * 班宠乐园官网 - 交互脚本
 */

// ========== 滚动入场动画 ==========
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // 处理 stagger 效果：同一父级下的多个 fade-up 子元素依次出现
          const el = entry.target
          const parent = el.parentElement
          if (parent) {
            const siblings = Array.from(parent.querySelectorAll(':scope > .fade-up, :scope > .fade-in'))
            const index = siblings.indexOf(el)
            if (index > 0) {
              el.style.transitionDelay = `${index * 30}ms`
            }
          }
          el.classList.add('visible')
          observer.unobserve(el)
        }
      })
    },
    { threshold: 0.01, rootMargin: '0px 0px 120px 0px' }
  )

  document.querySelectorAll('.fade-up, .fade-in').forEach((el) => {
    observer.observe(el)
  })
}

// ========== 导航栏滚动效果 ==========
function initNavbarScroll() {
  const navbar = document.getElementById('navbar')
  if (!navbar) return

  let ticking = false
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 50) {
          navbar.style.boxShadow = '0 1px 8px rgba(0,0,0,0.04)'
        } else {
          navbar.style.boxShadow = 'none'
        }
        ticking = false
      })
      ticking = true
    }
  })
}

// ========== 平滑滚动（兼容不支持 scroll-behavior 的浏览器） ==========
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href')
      if (!targetId || targetId === '#') return

      const target = document.querySelector(targetId)
      if (!target) return

      e.preventDefault()
      const navHeight = 64
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      })
    })
  })
}


// ========== 移动端 CTA 跳转小红书 ==========
function initMobileCTA() {
  const isMobile = window.innerWidth < 768
  if (!isMobile) return

  document.querySelectorAll('.js-cta').forEach((btn) => {
    const xhsUrl = btn.dataset.xhs
    if (xhsUrl) {
      btn.href = xhsUrl
      btn.removeAttribute('data-xhs')
    }
  })
}

// ========== 图片点击预览（支持双指缩放 + 拖动） ==========
var _pv = { scale: 1, x: 0, y: 0, startDist: 0, startScale: 1, startX: 0, startY: 0, dragging: false, moved: false }

function showPreview(src, alt) {
  var overlay = document.getElementById('img-overlay')
  var img = document.getElementById('img-overlay-src')
  if (!overlay || !img) return
  _pv.scale = 1; _pv.x = 0; _pv.y = 0
  img.style.transform = 'translate3d(0,0,0) scale(1)'
  img.src = src
  img.alt = alt || ''
  overlay.style.display = 'flex'
}

function hidePreview() {
  var overlay = document.getElementById('img-overlay')
  if (overlay) overlay.style.display = 'none'
}

function _pvApply() {
  var img = document.getElementById('img-overlay-src')
  if (img) img.style.transform = 'translate3d(' + _pv.x + 'px,' + _pv.y + 'px,0) scale(' + _pv.scale + ')'
}

function _pvDist(t) {
  var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function initImagePreview() {
  var overlay = document.getElementById('img-overlay')
  var img = document.getElementById('img-overlay-src')
  if (!overlay || !img) return

  img.style.willChange = 'transform'
  img.style.transformOrigin = 'center center'

  overlay.addEventListener('touchstart', function(e) {
    _pv.moved = false
    if (e.touches.length === 1) {
      _pv.dragging = true
      _pv.startX = e.touches[0].clientX - _pv.x
      _pv.startY = e.touches[0].clientY - _pv.y
    }
    if (e.touches.length === 2) {
      _pv.dragging = false
      _pv.moved = true
      _pv.startDist = _pvDist(e.touches)
      _pv.startScale = _pv.scale
    }
  }, { passive: true })

  overlay.addEventListener('touchmove', function(e) {
    e.preventDefault()
    _pv.moved = true
    if (e.touches.length === 1 && _pv.dragging && _pv.scale > 1) {
      _pv.x = e.touches[0].clientX - _pv.startX
      _pv.y = e.touches[0].clientY - _pv.startY
      _pvApply()
    }
    if (e.touches.length === 2) {
      var dist = _pvDist(e.touches)
      _pv.scale = Math.min(5, Math.max(0.5, _pv.startScale * (dist / _pv.startDist)))
      _pvApply()
    }
  }, { passive: false })

  overlay.addEventListener('touchend', function(e) {
    if (e.touches.length === 0) {
      _pv.dragging = false
      if (_pv.scale <= 1) {
        _pv.scale = 1; _pv.x = 0; _pv.y = 0
        img.style.transition = 'transform 0.2s'
        _pvApply()
        setTimeout(function() { img.style.transition = '' }, 200)
      }
      // 没有拖动/缩放的单击 → 关闭
      if (!_pv.moved) hidePreview()
    }
  }, { passive: true })

  // 桌面端点击关闭
  overlay.addEventListener('click', function(e) {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return
    hidePreview()
  })
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations()
  initNavbarScroll()
  initSmoothScroll()
  initMobileCTA()
  initImagePreview()
})
