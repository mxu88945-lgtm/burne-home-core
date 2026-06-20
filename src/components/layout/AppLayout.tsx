import { Outlet } from 'react-router-dom'
import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

export default function AppLayout() {
  return (
    <div className="app-bg min-h-screen">
      {/* 固定为手机宽度的居中列，桌面下不再自动伸展 */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col border-line bg-white/0 sm:border-x">
        <AppHeader />
        <main className="flex-1 px-5 pb-28 pt-1">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
