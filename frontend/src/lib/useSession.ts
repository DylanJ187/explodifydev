import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface SessionState {
  session: Session | null
  loading: boolean
}

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'
const FAKE_SESSION = {
  access_token: 'dev-bypass',
  refresh_token: 'dev-bypass',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'dev', email: 'dev@explodify.local' },
} as unknown as Session

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(DEV_BYPASS ? FAKE_SESSION : null)
  const [loading, setLoading] = useState(!DEV_BYPASS)

  useEffect(() => {
    if (DEV_BYPASS) return
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}
