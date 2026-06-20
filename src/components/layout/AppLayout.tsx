import { Outlet } from 'react-router-dom'
import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

export default function AppLayout() {
  return (
    // 滚动锁：固定壳 + 可视视口尺寸/位移，键盘弹出时整体贴住键盘上方，顶栏不被顶飞
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
        <AppHeader />
        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-1">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
