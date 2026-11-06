import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, readStoredTheme } from '@/store/themeStore'
import { hydrateDramaStore } from '@/store/dramaStore'
import { hydrateCharLibStore } from '@/store/charLibStore'

// 渲染前先应用已保存的主题，避免首屏闪烁
applyTheme(readStoredTheme())

const isIos =
  /iP(?:hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone =
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  (isIos && window.matchMedia('(display-mode: standalone)').matches)

if (isStandalone) document.documentElement.dataset.standalone = 'true'

// 用可视视口驱动 App 尺寸/位移：
// - 普通浏览器沿用 visualViewport，键盘弹出时贴在键盘上方；
// - iPhone 装机版在键盘关闭时用整块物理 CSS 屏幕高度，让主题/壁纸真正画进
//   刘海与 Home Indicator。100dvh/visualViewport 在部分 WebKit 版本只覆盖安全区。
function syncViewport() {
  const vv = window.visualViewport
  const root = document.documentElement
  let h = vv ? vv.height : window.innerHeight
  let top = vv ? vv.offsetTop : 0

  if (isStandalone) {
    const portrait = window.matchMedia('(orientation: portrait)').matches
    const longSide = Math.max(screen.width, screen.height)
    const shortSide = Math.min(screen.width, screen.height)
    const expectedWidth = portrait ? shortSide : longSide
    const fullHeight = portrait ? longSide : shortSide
    const isSplitView = Math.abs(window.innerWidth - expectedWidth) > 2
    const keyboardOpen = !isSplitView && !!vv && vv.height < fullHeight - 120

    root.toggleAttribute('data-keyboard', keyboardOpen)
    if (!isSplitView && !keyboardOpen) h = fullHeight
    top = 0
  }

  root.style.setProperty('--app-height', `${Math.round(h)}px`)
  root.style.setProperty('--app-offset', `${Math.round(top)}px`)
}
syncViewport()
window.visualViewport?.addEventListener('resize', syncViewport)
window.visualViewport?.addEventListener('scroll', syncViewport)
window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)

// ⚠️ 本机存储写满（iOS 每站约 5MB）时大声警告——静默丢数据是最不可原谅的 bug
let lastStorageWarn = 0
window.addEventListener('bw:storage-full', () => {
  const now = Date.now()
  if (now - lastStorageWarn < 60_000) return
  lastStorageWarn = now
  window.alert(
    '⚠️ 手机浏览器的存储空间满了，刚才的改动可能没保存住！\n\n' +
      '请尽快：\n1. 设置 → 数据·备份 → 导出整包备份（保住现有内容）\n' +
      '2. 同一页往下看「存储体检 🩺」：谁最大一目了然，按提示删旧剧本/旧会话\n\n' +
      '在腾出空间之前，新的聊天内容刷新后可能会丢失。'
  )
})

window.addEventListener('bw:storage-write-failed', () => {
  const now = Date.now()
  if (now - lastStorageWarn < 60_000) return
  lastStorageWarn = now
  window.alert('⚠️ 本地大仓库刚才没有写入成功。请先不要关闭页面，确认手机存储空间后重试刚才的操作。')
})

async function startApp() {
  try {
    // 两个最大文本仓先恢复/迁移，再渲染页面，避免空状态误覆盖旧数据。
    await Promise.all([hydrateDramaStore(), hydrateCharLibStore()])
  } catch (err) {
    console.error('[startup] 大仓库恢复失败', err)
    window.alert('本地数据仓库暂时读取失败，请不要编辑或删除内容。刷新页面重试；原数据仍保留在本机。')
    return
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void startApp()
