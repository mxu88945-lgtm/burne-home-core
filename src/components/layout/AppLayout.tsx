import { Outlet } from 'react-router-dom'
import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

export default function AppLayout() {
  return (
    // 滚动锁：高度跟随可视视口（键盘弹出自动缩），顶栏与底栏不随内容滚动
    <div
      className="app-bg flex flex-col overflow-hidden"
      style={{ height: 'var(--app-height, 100dvh)' }}
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
