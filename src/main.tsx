import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, readStoredTheme } from '@/store/themeStore'

// 渲染前先应用已保存的主题，避免首屏闪烁
applyTheme(readStoredTheme())

// 用可视视口驱动 App 尺寸/位移：键盘弹出时整体缩到键盘上方且不被顶飞
function syncViewport() {
  const vv = window.visualViewport
  const h = vv ? vv.height : window.innerHeight
  const top = vv ? vv.offsetTop : 0
  const root = document.documentElement
  root.style.setProperty('--app-height', `${Math.round(h)}px`)
  root.style.setProperty('--app-offset', `${Math.round(top)}px`)
}
syncViewport()
window.visualViewport?.addEventListener('resize', syncViewport)
window.visualViewport?.addEventListener('scroll', syncViewport)
window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
