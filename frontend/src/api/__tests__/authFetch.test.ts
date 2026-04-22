import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './msw-server'

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn()
const mockRefreshSession = vi.fn()
const mockSignOut = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
      signOut: mockSignOut,
    },
  },
}))

// ---------------------------------------------------------------------------
// window.location.assign mock
// jsdom makes location non-configurable by default; replace the whole object.
// ---------------------------------------------------------------------------

const mockAssign = vi.fn()

Object.defineProperty(window, 'location', {
  value: { assign: mockAssign, href: 'http://localhost/' },
  writable: true,
})

// ---------------------------------------------------------------------------
// Helper: build a Supabase-shaped session response
// ---------------------------------------------------------------------------

function sessionOf(accessToken: string) {
  return {
    data: {
      session: {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'refresh-' + accessToken,
        user: { id: 'user-uuid', email: 'test@example.com' },
      },
    },
    error: null,
  }
}

function noSession() {
  return { data: { session: null }, error: null }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authFetch', () => {
  // Re-import authFetch fresh each test so module-level _refreshInFlight is reset.
  // vitest's module registry is persistent within a describe block unless we use
  // vi.resetModules() + dynamic import.
  let authFetch: typeof import('../authFetch').authFetch
  let AuthRequiredError: typeof import('../errors').AuthRequiredError

  beforeEach(async () => {
    vi.resetModules()
    // Dynamic import after resetModules gives us a fresh module instance,
    // which clears _refreshInFlight between tests.
    const authFetchMod = await import('../authFetch')
    const errorsMod = await import('../errors')
    authFetch = authFetchMod.authFetch
    AuthRequiredError = errorsMod.AuthRequiredError

    mockGetSession.mockReset()
    mockRefreshSession.mockReset()
    mockSignOut.mockReset()
    mockAssign.mockReset()
  })

  // 1. Happy path ─────────────────────────────────────────────────────────────
  it('happy_path: injects Bearer token and returns 200 response', async () => {
    mockGetSession.mockResolvedValue(sessionOf('T1'))

    const capturedHeaders: string[] = []

    server.use(
      http.get('/api/resource', ({ request }) => {
        capturedHeaders.push(request.headers.get('Authorization') ?? '')
        return HttpResponse.json({ ok: true }, { status: 200 })
      }),
    )

    const response = await authFetch('/api/resource')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ ok: true })
    expect(capturedHeaders).toHaveLength(1)
    expect(capturedHeaders[0]).toBe('Bearer T1')
    expect(mockRefreshSession).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  // 2. No session ─────────────────────────────────────────────────────────────
  it('no_session_throws_AuthRequiredError: throws before calling server', async () => {
    mockGetSession.mockResolvedValue(noSession())

    const requestCount = { n: 0 }
    server.use(
      http.all('*', () => {
        requestCount.n++
        return HttpResponse.json({}, { status: 200 })
      }),
    )

    await expect(authFetch('/api/resource')).rejects.toThrow(AuthRequiredError)

    expect(requestCount.n).toBe(0)
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  // 3. Refresh success ─────────────────────────────────────────────────────────
  it('refresh_success_retries_and_returns_200: refreshes once, retries with new token', async () => {
    // First getSession call → T1; after refresh → T2
    mockGetSession
      .mockResolvedValueOnce(sessionOf('T1'))
      .mockResolvedValueOnce(sessionOf('T2'))

    mockRefreshSession.mockResolvedValue(sessionOf('T2'))

    let callCount = 0
    const capturedTokens: string[] = []

    server.use(
      http.get('/api/resource', ({ request }) => {
        callCount++
        capturedTokens.push(request.headers.get('Authorization') ?? '')
        const status = callCount === 1 ? 401 : 200
        return HttpResponse.json({ call: callCount }, { status })
      }),
    )

    const response = await authFetch('/api/resource')

    expect(response.status).toBe(200)
    expect(mockRefreshSession).toHaveBeenCalledTimes(1)
    expect(callCount).toBe(2)
    expect(capturedTokens[0]).toBe('Bearer T1')
    expect(capturedTokens[1]).toBe('Bearer T2')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  // 4. Second 401 after refresh ────────────────────────────────────────────────
  it('second_401_signs_out_and_redirects: signOut + redirect when retry also 401s', async () => {
    mockGetSession
      .mockResolvedValueOnce(sessionOf('T1'))
      .mockResolvedValueOnce(sessionOf('T2'))

    mockRefreshSession.mockResolvedValue(sessionOf('T2'))
    mockSignOut.mockResolvedValue({ error: null })

    server.use(
      http.get('/api/resource', () => {
        return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
      }),
    )

    await expect(authFetch('/api/resource')).rejects.toThrow(AuthRequiredError)

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockAssign).toHaveBeenCalledWith('/login')
  })

  // 5. Refresh returns no session ──────────────────────────────────────────────
  it('refresh_fails_signs_out_and_redirects: signOut + redirect, no retry attempted', async () => {
    mockGetSession.mockResolvedValue(sessionOf('T1'))
    mockRefreshSession.mockResolvedValue(noSession())
    mockSignOut.mockResolvedValue({ error: null })

    let callCount = 0
    server.use(
      http.get('/api/resource', () => {
        callCount++
        return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
      }),
    )

    await expect(authFetch('/api/resource')).rejects.toThrow(AuthRequiredError)

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockAssign).toHaveBeenCalledWith('/login')
    // No retry because refresh produced no session
    expect(callCount).toBe(1)
  })

  // 6. Concurrent 401s — single-flight refresh ─────────────────────────────────
  it('concurrent_401s_single_flight_refresh: refreshSession called exactly once for 5 parallel requests', async () => {
    mockGetSession.mockResolvedValue(sessionOf('T1'))
    mockRefreshSession.mockResolvedValue(sessionOf('T2'))

    // After refresh getSession returns T2 for all retries
    mockGetSession
      .mockResolvedValueOnce(sessionOf('T1'))  // 5 initial calls share T1
      .mockResolvedValueOnce(sessionOf('T1'))
      .mockResolvedValueOnce(sessionOf('T1'))
      .mockResolvedValueOnce(sessionOf('T1'))
      .mockResolvedValueOnce(sessionOf('T1'))
      .mockResolvedValue(sessionOf('T2'))       // all retry calls return T2

    const callCounts = [0, 0, 0, 0, 0]
    const retryTokens: string[] = []

    server.use(
      http.get('/api/resource/:n', ({ request, params }) => {
        const n = Number(params.n) - 1
        callCounts[n]++
        const token = request.headers.get('Authorization') ?? ''
        const isRetry = callCounts[n] === 2
        if (isRetry) retryTokens.push(token)
        const status = callCounts[n] === 1 ? 401 : 200
        return HttpResponse.json({ resource: n, call: callCounts[n] }, { status })
      }),
    )

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(n => authFetch(`/api/resource/${n}`)),
    )

    expect(mockRefreshSession).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(5)
    results.forEach(r => expect(r.status).toBe(200))
    retryTokens.forEach(t => expect(t).toBe('Bearer T2'))
  })

  // 7. Network error propagates ────────────────────────────────────────────────
  it('network_error_propagates: re-raises fetch TypeError without attempting refresh', async () => {
    mockGetSession.mockResolvedValue(sessionOf('T1'))

    server.use(
      http.get('/api/resource', () => {
        return HttpResponse.error()
      }),
    )

    await expect(authFetch('/api/resource')).rejects.toThrow(TypeError)

    expect(mockRefreshSession).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  // 8. Non-401 error returned as-is ────────────────────────────────────────────
  it('non_401_error_returned_as_is: 500 response returned without refresh', async () => {
    mockGetSession.mockResolvedValue(sessionOf('T1'))

    server.use(
      http.get('/api/resource', () => {
        return HttpResponse.json({ error: 'internal server error' }, { status: 500 })
      }),
    )

    const response = await authFetch('/api/resource')

    expect(response.status).toBe(500)
    expect(mockRefreshSession).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  // 9. getSession throws — propagate original SDK error ───────────────────────
  it('getSession_throws_propagates: SDK failure surfaces without touching the network or signing out', async () => {
    const sdkError = new Error('SDK failure')
    mockGetSession.mockRejectedValueOnce(sdkError)

    let requestCount = 0
    server.use(
      http.all('*', () => {
        requestCount++
        return HttpResponse.json({}, { status: 200 })
      }),
    )

    // The original error propagates — NOT an AuthRequiredError.
    await expect(authFetch('/api/resource')).rejects.toThrow(sdkError)

    expect(requestCount).toBe(0)
    expect(mockRefreshSession).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  // 10. Refresh rejects — sign out + redirect ─────────────────────────────────
  it('refresh_rejects_signs_out_and_redirects: rejected refreshSession promise still signs out', async () => {
    mockGetSession.mockResolvedValue(sessionOf('T1'))
    mockRefreshSession.mockRejectedValue(new Error('refresh network failure'))
    mockSignOut.mockResolvedValue({ error: null })

    server.use(
      http.get('/api/resource', () => {
        return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
      }),
    )

    await expect(authFetch('/api/resource')).rejects.toThrow()

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockAssign).toHaveBeenCalledWith('/login')
  })
})
