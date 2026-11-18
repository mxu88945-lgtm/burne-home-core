import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import PrivacyGate from '@/components/PrivacyGate'
import GuardLockOverlay from '@/components/GuardLockOverlay'

export default function App() {
  return (
    <PrivacyGate>
      <RouterProvider router={router} />
      <GuardLockOverlay />
    </PrivacyGate>
  )
}
