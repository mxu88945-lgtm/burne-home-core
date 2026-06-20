import { createHashRouter } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Home from '@/pages/Home'
import MemoryLibrary from '@/pages/MemoryLibrary'
import Chat from '@/pages/Chat'
import Persona from '@/pages/Persona'
import ThemePage from '@/pages/ThemePage'
import Search from '@/pages/Search'
import Settings from '@/pages/Settings'
import SyncPage from '@/pages/settings/SyncPage'
import ApiPage from '@/pages/settings/ApiPage'
import UsagePage from '@/pages/settings/UsagePage'
import DataPage from '@/pages/settings/DataPage'
import PrivacyPage from '@/pages/settings/PrivacyPage'
import TtsPage from '@/pages/settings/TtsPage'
import AppearancePage from '@/pages/settings/AppearancePage'
import NotFound from '@/pages/NotFound'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'memories', element: <MemoryLibrary /> },
      { path: 'chat', element: <Chat /> },
      { path: 'persona', element: <Persona /> },
      { path: 'theme', element: <ThemePage /> },
      { path: 'search', element: <Search /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/sync', element: <SyncPage /> },
      { path: 'settings/api', element: <ApiPage /> },
      { path: 'settings/tts', element: <TtsPage /> },
      { path: 'settings/appearance', element: <AppearancePage /> },
      { path: 'settings/usage', element: <UsagePage /> },
      { path: 'settings/data', element: <DataPage /> },
      { path: 'settings/privacy', element: <PrivacyPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
