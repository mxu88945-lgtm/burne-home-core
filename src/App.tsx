import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import PrivacyGate from '@/components/PrivacyGate'

export default function App() {
  return (
    <PrivacyGate>
      <RouterProvider router={router} />
    </PrivacyGate>
  )
}
