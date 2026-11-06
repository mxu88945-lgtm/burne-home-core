import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyChatFont, applyTheme, readStoredChatFont, readStoredTheme } from '@/store/themeStore'
import { hydrateDramaStore } from '@/store/dramaStore'
import { hydrateCharLibStore } from '@/store/charLibStore'
import { resolveStandaloneFrame } from '@/lib/viewportGeometry'

// 渲染前先应用已保存的主题，避免首屏闪烁
applyTheme(readStoredTheme())
applyChatFont(readStoredChatFont())

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
let lastKeyboardInset = 0

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
    if (!isSplitView) {
      const geometry = resolveStandaloneFrame({
        fullHeight,
        visualHeight: vv?.height,
        offsetTop: vv?.offsetTop,
        lastKeyboardInset,
      })
      // 键盘打开时直接把整座 App 收到键盘上沿（惟境/顾祁砚验证过的做法），
      // 不再靠底部 padding 垫高：iOS 会同时平移页面，两者叠加时输入框被键盘压住。
      // 键盘打开且读数可信：App 直接贴合可视视口——高度 = vv.height，并随 iOS 的页面平移
      // （vv.offsetTop）一起下移。之前用「整屏 − inset」+ scrollTo(0,0)：body 是 fixed，
      // scrollTo 拉不回平移，键盘上方的 ^ ˅ ✓ 工具条又不算进 inset，结果顶栏被推出屏幕、
      // 输入框下半截压在工具条下面。
      // 2026-11-06 改用惟境在她 iPhone 上验证过的做法：App 高度 = vv.height，不做位移，
      // 并把 iOS 的页面平移 scrollTo(0,0) 拉回（body 不再 fixed，scrollTo 才有效）。
      if (geometry.keyboardOpen && geometry.readingSane && vv) {
        h = geometry.frameHeight
        // visualViewport.height 已经停在键盘工具栏上沿；offsetTop 是同一次页面平移，
        // 不能再作为 fixed 壳的 translateY，否则 composer 会被重复往下推。
        top = geometry.frameOffset
        if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0)
      } else {
        h = geometry.frameHeight
        top = geometry.frameOffset
      }
      lastKeyboardInset = geometry.keyboardInset
      root.toggleAttribute('data-keyboard', geometry.keyboardOpen)
      root.style.setProperty('--keyboard-inset', `${geometry.keyboardInset}px`)
    } else {
      root.removeAttribute('data-keyboard')
      root.style.setProperty('--keyboard-inset', '0px')
      top = 0
    }
  }

  root.style.setProperty('--app-height', `${Math.round(h)}px`)
  root.style.setProperty('--app-offset', `${Math.round(top)}px`)
  if (root.hasAttribute('data-keyboard')) resetContainerScroll()
}

// iOS 聚焦输入框时会把 overflow:hidden 的外层容器（App 外壳、聊天壳）也滚上去露出光标，
// 这些容器不会自己滚回来：顶栏被推出屏幕、输入框下半截跑到键盘后面。逐层复位。
function resetContainerScroll() {
  const els: (Element | null)[] = [
    document.documentElement,
    document.body,
    document.getElementById('root'),
    document.getElementById('bw-app-shell'),
    document.getElementById('bw-app-shell')?.firstElementChild ?? null,
    document.querySelector('.bw-chat-shell'),
    document.querySelector('.bw-chat-shell')?.parentElement ?? null,
  ]
  for (const el of els) if (el && el.scrollTop) el.scrollTop = 0
}

syncViewport()
window.visualViewport?.addEventListener('resize', syncViewport)
window.visualViewport?.addEventListener('scroll', syncViewport)
window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)
// iOS 聚焦输入框后会再滚一次页面，但不一定再发 visualViewport 事件：补测几次。
document.addEventListener('focusin', () => {
  for (const ms of [60, 250, 500, 800, 1200]) window.setTimeout(syncViewport, ms)
})
document.addEventListener('focusout', () => window.setTimeout(syncViewport, 250))

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
