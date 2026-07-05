import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, readStoredTheme } from '@/store/themeStore'

// 渲染前先应用已保存的主题，避免首屏闪烁
applyTheme(readStoredTheme())

// iOS PWA 里 visualViewport.height 容易只算到 WebKit 认可的可视区，导致底部露白。
// 默认让外壳吃满 100vh；只有键盘真的弹出、可视区明显变矮时，才临时缩到键盘上方。
function syncViewport() {
  const vv = window.visualViewport
  const root = document.documentElement
  const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0)
  const visualHeight = vv ? Math.round(vv.height) : layoutHeight
  const offsetTop = vv ? Math.round(vv.offsetTop) : 0
  const keyboardOpen = visualHeight > 0 && layoutHeight - visualHeight > 120

  if (keyboardOpen) {
    root.style.setProperty('--app-height', `${visualHeight}px`)
    root.style.setProperty('--app-offset', `${offsetTop}px`)
  } else {
    root.style.setProperty('--app-height', '100vh')
    root.style.setProperty('--app-offset', '0px')
  }
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
