import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../lib/useSession'

export default function RequireAuth() {
  const { session, loading } = useSession()

  if (loading) {
    return <div style={{ background: '#080808', minHeight: '100vh' }} />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
