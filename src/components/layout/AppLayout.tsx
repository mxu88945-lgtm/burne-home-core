import { Outlet } from 'react-router-dom'
import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

export default function AppLayout() {
  return (
    <div className="app-bg min-h-screen">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col">
        <AppHeader />
        <main className="flex-1 px-5 pb-28 pt-1">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
