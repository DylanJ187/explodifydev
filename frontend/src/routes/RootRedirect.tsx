import { Navigate } from 'react-router-dom'
import { useSession } from '../lib/useSession'
import LandingPage from '../pages/LandingPage'

export default function RootRedirect() {
  const { session, loading } = useSession()

  if (loading) {
    return <div style={{ background: '#080808', minHeight: '100vh' }} />
  }

  if (session) {
    return <Navigate to="/gallery" replace />
  }

  return <LandingPage />
}
