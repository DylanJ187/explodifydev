import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

export default function LoginPage() {
  const navigate = useNavigate()
  const { session, loading } = useSession()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && session) {
      navigate('/gallery', { replace: true })
    }
  }, [session, loading, navigate])

  async function handleGoogle() {
    setErrorMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setErrorMsg(null)
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (loading) {
    return <div style={{ background: '#080808', minHeight: '100vh' }} />
  }

  return (
    <div
      style={{
        background: '#080808',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#0e0e0e',
          border: '1px solid #1f1f1f',
          borderRadius: 8,
          padding: 32,
          color: '#e8e8e8',
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}
        >
          Sign in to Explodify
        </h1>
        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 24 }}>
          Use Google or a magic link sent to your email.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: '#e8e8e8',
            color: '#080808',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          Continue with Google
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '16px 0',
            fontSize: 11,
            opacity: 0.4,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ flex: 1, height: 1, background: '#1f1f1f' }} />
          or
          <span style={{ flex: 1, height: 1, background: '#1f1f1f' }} />
        </div>

        <form onSubmit={handleMagicLink}>
          <label
            htmlFor="login-email"
            style={{
              display: 'block',
              fontSize: 11,
              opacity: 0.6,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#080808',
              border: '1px solid #1f1f1f',
              borderRadius: 4,
              color: '#e8e8e8',
              fontSize: 14,
              marginBottom: 12,
            }}
          />
          <button
            type="submit"
            disabled={status === 'sending' || !email}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: '#d4a843',
              color: '#080808',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600,
              cursor: status === 'sending' ? 'default' : 'pointer',
              opacity: status === 'sending' ? 0.6 : 1,
            }}
          >
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
        </form>

        {status === 'sent' && (
          <p style={{ fontSize: 12, opacity: 0.8, marginTop: 16 }}>
            Check your inbox for a link to sign in.
          </p>
        )}
        {status === 'error' && errorMsg && (
          <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 16 }}>{errorMsg}</p>
        )}
      </div>
    </div>
  )
}
