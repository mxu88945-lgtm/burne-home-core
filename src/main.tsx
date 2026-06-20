import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, readStoredTheme } from '@/store/themeStore'

// 渲染前先应用已保存的主题，避免首屏闪烁
applyTheme(readStoredTheme())

// 用可视视口高度驱动 App 高度：键盘弹出时整体缩到键盘上方，顶栏不被顶飞
function syncAppHeight() {
  const h = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`)
}
syncAppHeight()
window.visualViewport?.addEventListener('resize', syncAppHeight)
window.visualViewport?.addEventListener('scroll', syncAppHeight)
window.addEventListener('resize', syncAppHeight)
window.addEventListener('orientationchange', syncAppHeight)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
