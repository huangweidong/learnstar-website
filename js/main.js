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
              el.style.transitionDelay = `${index * 100}ms`
            }
          }
          el.classList.add('visible')
          observer.unobserve(el)
        }
      })
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
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

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations()
  initNavbarScroll()
  initSmoothScroll()
})
