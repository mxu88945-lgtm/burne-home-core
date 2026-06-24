import { Outlet, useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'

export default function AppLayout() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  // 聊天页 / 小手机自管头部与内边距（沉浸式）；首页用全局顶栏；其余页自带返回头
  const isChat = pathname === '/chat' || pathname === '/phone'

  return (
    // 滚动锁：固定壳 + 可视视口尺寸/位移，键盘弹出时整体贴住键盘上方
    <div
      className="app-bg flex flex-col overflow-hidden"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--app-height, 100dvh)',
        transform: 'translateY(var(--app-offset, 0px))',
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-[440px] flex-col border-line sm:border-x">
        {isHome && <AppHeader />}
        <main
          className={
            isChat
              ? 'min-h-0 flex-1 overflow-y-auto'
              : isHome
                ? 'min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1'
                : 'min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]'
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
