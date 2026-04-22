import { supabase } from '../lib/supabase'
import { AuthRequiredError } from './errors'

// Single-flight latch: while a refresh is in progress, all concurrent 401s
// await the same promise. The first caller to hit `finally` resets it to
// null; subsequent callers also hit `finally` but the assignment is
// idempotent. vitest's `vi.resetModules()` reloads the module and resets
// this binding between tests.
let _refreshInFlight: Promise<void> | null = null

function doFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.assign('/login')
  }
}

async function signOutAndRedirect(): Promise<void> {
  await supabase.auth.signOut()
  redirectToLogin()
}

export const authFetch: typeof fetch = async (input, init) => {
  // 1. Require a session before touching the network.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new AuthRequiredError('no session')
  }

  // 2. Attempt the request with the current access token.
  const firstResponse = await doFetch(input, init, session.access_token)
  if (firstResponse.status !== 401) {
    return firstResponse
  }

  // 3. 401 path: single-flight refresh. Only the first caller kicks off the
  // refresh; all others await the same promise. The latch is cleared INSIDE
  // the IIFE's finally so only the original refresher resets it — waiters
  // that await `_refreshInFlight` must not reset the binding or a late-
  // arriving caller could see null and fire a second refresh.
  //
  // signOutAndRedirect is also invoked inside the IIFE so it fires exactly
  // once per refresh failure, regardless of how many callers were waiting.
  // This covers both resolved-but-failed (null session) and rejected
  // refreshSession() promises.
  if (!_refreshInFlight) {
    _refreshInFlight = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession()
        if (error || !data.session) {
          await signOutAndRedirect()
          throw new AuthRequiredError('refresh failed')
        }
      } catch (err) {
        // If the SDK rejects (network failure, etc.) we still want to sign
        // out the user and redirect, mirroring the resolved-null-session
        // path. AuthRequiredError is already in its signed-out shape, so
        // re-raise without duplicating the signOut call.
        if (!(err instanceof AuthRequiredError)) {
          await signOutAndRedirect()
        }
        throw err
      } finally {
        _refreshInFlight = null
      }
    })()
  }

  await _refreshInFlight

  // 4. Retry once with the freshly-refreshed token.
  const { data: { session: newSession } } = await supabase.auth.getSession()
  if (!newSession) {
    throw new AuthRequiredError('no session after refresh')
  }

  const secondResponse = await doFetch(input, init, newSession.access_token)
  if (secondResponse.status === 401) {
    await signOutAndRedirect()
    throw new AuthRequiredError('second 401')
  }
  return secondResponse
}
