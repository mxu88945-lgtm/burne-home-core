import { createHashRouter } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Home from '@/pages/Home'
import MemoryLibrary from '@/pages/MemoryLibrary'
import MemoryDiagnostics from '@/pages/MemoryDiagnostics'
import Chat from '@/pages/Chat'
import PhonePage from '@/pages/PhonePage'
import ReadingRoom from '@/pages/ReadingRoom'
import DramaList from '@/pages/DramaList'
import DramaRoom from '@/pages/DramaRoom'
import CharLibrary from '@/pages/CharLibrary'
import CalendarPage from '@/pages/CalendarPage'
import ReadingPage from '@/pages/settings/ReadingPage'
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
import ImageGenPage from '@/pages/settings/ImageGenPage'
import VisionPage from '@/pages/settings/VisionPage'
import MemoryModelPage from '@/pages/settings/MemoryModelPage'
import SttPage from '@/pages/settings/SttPage'
import NotFound from '@/pages/NotFound'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'memories', element: <MemoryLibrary /> },
      { path: 'memory-diagnostics', element: <MemoryDiagnostics /> },
      { path: 'chat', element: <Chat /> },
      { path: 'phone', element: <PhonePage /> },
      { path: 'reading', element: <ReadingRoom /> },
      { path: 'drama', element: <DramaList /> },
      { path: 'drama/room', element: <DramaRoom /> },
      { path: 'characters', element: <CharLibrary /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'settings/reading', element: <ReadingPage /> },
      { path: 'persona', element: <Persona /> },
      { path: 'theme', element: <ThemePage /> },
      { path: 'search', element: <Search /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/sync', element: <SyncPage /> },
      { path: 'settings/api', element: <ApiPage /> },
      { path: 'settings/tts', element: <TtsPage /> },
      { path: 'settings/imagegen', element: <ImageGenPage /> },
      { path: 'settings/vision', element: <VisionPage /> },
      { path: 'settings/memory-model', element: <MemoryModelPage /> },
      { path: 'settings/stt', element: <SttPage /> },
      { path: 'settings/appearance', element: <AppearancePage /> },
      { path: 'settings/usage', element: <UsagePage /> },
      { path: 'settings/data', element: <DataPage /> },
      { path: 'settings/privacy', element: <PrivacyPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
