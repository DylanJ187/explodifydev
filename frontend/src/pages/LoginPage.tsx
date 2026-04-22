import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

type Status = 'idle' | 'sending' | 'sent' | 'verifying' | 'error'

export default function LoginPage() {
  const navigate = useNavigate()
  const { session, loading } = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
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

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setErrorMsg(null)
    setStatus('sending')
    // The email template was switched to `{{ .Token }}` only (no link), so the
    // user receives a 6-digit code. Safe Links / preview scanners can't
    // pre-consume a code you type by hand, unlike a magic-link URL.
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (!code) return
    setErrorMsg(null)
    setStatus('verifying')
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    }
    // On success, the session is set and the useEffect above navigates.
  }

  function resetToEmailStep() {
    setCode('')
    setErrorMsg(null)
    setStatus('idle')
  }

  if (loading) {
    return <div style={{ background: '#080808', minHeight: '100vh' }} />
  }

  const showCodeStep = status === 'sent' || status === 'verifying' || (status === 'error' && code !== '')

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
          {showCodeStep
            ? `We sent a 6-digit code to ${email}.`
            : 'Use Google or a 6-digit code sent to your email.'}
        </p>

        {!showCodeStep && (
          <>
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

            <form onSubmit={handleSendCode}>
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
                {status === 'sending' ? 'Sending…' : 'Send code'}
              </button>
            </form>
          </>
        )}

        {showCodeStep && (
          <form onSubmit={handleVerifyCode}>
            <label
              htmlFor="login-code"
              style={{
                display: 'block',
                fontSize: 11,
                opacity: 0.6,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Verification code
            </label>
            <input
              id="login-code"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              placeholder="123456"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#080808',
                border: '1px solid #1f1f1f',
                borderRadius: 4,
                color: '#e8e8e8',
                fontSize: 18,
                letterSpacing: '0.3em',
                textAlign: 'center',
                marginBottom: 12,
              }}
            />
            <button
              type="submit"
              disabled={status === 'verifying' || !code}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: '#d4a843',
                color: '#080808',
                border: 'none',
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 600,
                cursor: status === 'verifying' ? 'default' : 'pointer',
                opacity: status === 'verifying' ? 0.6 : 1,
                marginBottom: 8,
              }}
            >
              {status === 'verifying' ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={resetToEmailStep}
              style={{
                width: '100%',
                padding: '8px 16px',
                background: 'transparent',
                color: '#e8e8e8',
                border: '1px solid #1f1f1f',
                borderRadius: 4,
                fontSize: 12,
                cursor: 'pointer',
                opacity: 0.7,
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {status === 'error' && errorMsg && (
          <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 16 }}>{errorMsg}</p>
        )}
      </div>
    </div>
  )
}
