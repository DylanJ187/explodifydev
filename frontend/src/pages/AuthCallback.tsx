import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// With `detectSessionInUrl: true` + `flowType: 'pkce'` in supabase.ts, the SDK
// performs the `?code=` → session exchange itself during client init
// (gotrue-js `_initialize` → `_getSessionFromURL`). The PKCE code verifier is
// single-use: if we also call `exchangeCodeForSession` from here we race the
// SDK and whichever call loses throws "PKCE code verifier not found in
// storage". So we do not call it — we just wait for the session to appear via
// `onAuthStateChange` (fallback: `getSession()` if init already finished
// before we mounted) and then redirect.
const SESSION_WAIT_MS = 8000

export default function AuthCallback() {
  const navigate = useNavigate()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let settled = false

    const finish = (target: '/gallery' | null, message?: string) => {
      if (settled) return
      settled = true
      if (target) {
        navigate(target, { replace: true })
      } else if (message) {
        setErrorMsg(message)
      }
    }

    // Supabase redirects a failed magic-link to `?error=...&error_description=...`.
    // Surface that immediately instead of waiting for the session timeout.
    const url = new URL(window.location.href)
    const urlError = url.searchParams.get('error_description') ?? url.searchParams.get('error')
    if (urlError) {
      finish(null, urlError)
      return
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        finish('/gallery')
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish('/gallery')
    })

    const timer = window.setTimeout(() => {
      finish(null, 'Sign-in timed out. The magic link may have expired — please request a new one.')
    }, SESSION_WAIT_MS)

    return () => {
      sub.subscription.unsubscribe()
      window.clearTimeout(timer)
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
