import { createHashRouter } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Home from '@/pages/Home'
import MemoryLibrary from '@/pages/MemoryLibrary'
import Chat from '@/pages/Chat'
import Search from '@/pages/Search'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'memories', element: <MemoryLibrary /> },
      { path: 'chat', element: <Chat /> },
      { path: 'search', element: <Search /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
