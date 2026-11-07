import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyChatFont, applyTheme, readStoredChatFont, readStoredTheme } from '@/store/themeStore'
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
      // 键盘打开时直接把整座 App 收到 visualViewport.height，不靠三个页面各自
      // 加 padding。iOS 同时给出的 offsetTop 只是页面平移，不能参与“键盘是否打开”
      // 或可见高度计算：例如 956px 屏幕会报 height=520、offsetTop=374，二者相加
      // 会把真实键盘误判成 62px 的状态栏差，导致主聊/剧场/小手机一起被工具栏盖住。
      if (geometry.keyboardOpen && geometry.readingSane && vv) {
        h = geometry.frameHeight
        // visualViewport.height 已经停在键盘工具条上沿；offsetTop 是同一次
        // 页面平移，不能再用它下移 fixed 壳，否则 composer 会被重复往下推。
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

async function purgeRemovedDrama() {
  const FLAG = 'burne-home-core:drama-purged'
  try {
    if (localStorage.getItem(FLAG)) return
    const { idbDel } = await import('@/lib/idb')
    for (const key of ['burne-home-core:drama', 'burne-home-core:char-lib']) {
      localStorage.removeItem(key)
      await idbDel(`state:${key}`)
    }
    const bgRaw = localStorage.getItem('burne-home-core:appearance')
    if (bgRaw) {
      const ap = JSON.parse(bgRaw) as { state?: Record<string, unknown> } & Record<string, unknown>
      const box = (ap.state && typeof ap.state === 'object' ? ap.state : ap) as Record<string, unknown>
      const target = (box.appearance && typeof box.appearance === 'object' ? box.appearance : box) as Record<string, unknown>
      const ref = target.dramaBg
      if (typeof ref === 'string' && ref.startsWith('idb:')) await idbDel(ref.slice(4))
    }
    localStorage.setItem(FLAG, '1')
  } catch (err) {
    console.warn('[drama-purge] 清理失败，下次启动再试', err)
  }
}

async function startApp() {
  // 戏剧板块已删除（2026-11-07 她决定：剧情交给惟境/顾祁砚剧场）。一次性清掉戏剧与角色卡库的本地数据，失败不挡启动。
  void purgeRemovedDrama()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void startApp()
