import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function exchange() {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
      if (cancelled) return
      if (error) {
        setErrorMsg(error.message)
        return
      }
      navigate('/gallery', { replace: true })
    }

    exchange()

    return () => {
      cancelled = true
    }
  }, [navigate])

  if (errorMsg) {
    return (
      <div
        style={{
          background: '#080808',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e8e8e8',
          flexDirection: 'column',
          gap: 12,
          padding: 24,
        }}
      >
        <p style={{ fontSize: 14, color: '#ff6b6b' }}>Sign-in failed: {errorMsg}</p>
        <a href="/login" style={{ color: '#d4a843', fontSize: 13 }}>
          Try again
        </a>
      </div>
    )
  }

  return <div style={{ background: '#080808', minHeight: '100vh' }} />
}
