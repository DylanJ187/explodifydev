# ADR-001: Supabase JWT verification via JWKS

**Status:** Accepted
**Date:** 2026-04-21
**Context:** PR 1 — Auth hardening, first pass that blocks any public URL.

---

## Context

Explodify is transitioning from a single-user local dev build to a multi-tenant
hosted app. Every non-health route has to require an authenticated Supabase
session, and the backend has to verify that session locally (no blocking
round-trip to Supabase per request).

Three independent verification paths were on the table:

1. **JWKS + asymmetric signature verification.** Fetch the project's JSON Web
   Key Set from `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`,
   cache it, verify every incoming `Authorization: Bearer <jwt>` against the
   cached public key. Supabase signs with ES256 / RS256.
2. **Shared HMAC secret (HS256).** Use the project's legacy JWT secret as the
   HMAC key on both the Supabase side and our side.
3. **Call Supabase `/auth/v1/user` for every request.** Let Supabase verify the
   token and return the user; we trust the response.

## Decision

We chose **(1) JWKS + asymmetric signature verification**, implemented in
`backend/auth.py` using `python-jose[cryptography]==3.5.0`.

Key implementation details:

- `@lru_cache(maxsize=1) jwks()` fetches and caches the JWKS via `httpx`.
- `verify_jwt()` pulls the `kid` from the unverified header and matches it
  against the cached JWKS before decoding. On a kid miss we call
  `jwks.cache_clear()` exactly once and refetch, so a Supabase-side key
  rotation never requires a backend restart.
- `SUPABASE_JWT_ALGS` defaults to `{"ES256", "RS256"}`. `HS256` is
  **hard-rejected at module import** — a misconfigured operator cannot weaken
  signature verification from an env var.
- `SUPABASE_URL` is read via `os.environ["SUPABASE_URL"]` at import time. A
  missing or non-`https://` value raises before the app can serve traffic.
- All HTTP error details are generic literal strings ("invalid token"). The
  underlying `JWTError` message is never forwarded to clients.

## Rationale

**Why JWKS over HS256 (option 2):**
- Supabase's newer projects (and our project) already sign with ES256. HS256
  would mean either downgrading the project or maintaining a parallel signing
  path.
- HS256 couples the backend to a shared secret. Key rotation is all-or-nothing,
  and a leaked backend binary leaks the signing key.
- HS256 exposes us to algorithm-confusion attacks if a verification path ever
  treats a public key as a shared secret. Hard-rejecting HS256 at import
  removes an entire class of mistake.

**Why JWKS over calling `/auth/v1/user` per request (option 3):**
- Per-request network hop on every protected endpoint. At Kling-pipeline scale
  (long-lived pipeline jobs with multiple polling calls) this is noisy and
  expensive.
- Coupled availability: if Supabase's auth API is degraded, every Explodify
  request 5xx's. Local JWKS verification is available as long as the cached
  key is fresh.
- Caching the user payload from `/auth/v1/user` is subtle — you have to decide
  a TTL, handle session invalidation, and build the same kid-rotation dance
  anyway.

**Why `python-jose` over `pyjwt`:**
- `python-jose` accepts a JWKS dict directly in `jwt.decode(key=jwks_dict, ...)`,
  which matches the shape Supabase publishes. `pyjwt` requires pulling the
  right key out manually and passing a PEM.
- Both are well-maintained. `python-jose 3.5.0` had no relevant CVEs at the
  time of adoption.

## Consequences

**Positive:**
- Verification is local, constant-time, and survives Supabase auth-API
  outages for up to the JWKS TTL plus one refetch.
- Key rotations are handled transparently via the kid-miss retry.
- Algorithm-confusion attacks are structurally impossible — HS256 cannot be
  re-enabled without changing module source.
- A missing `SUPABASE_URL` is surfaced at process start, not at first
  incoming request.

**Negative / watch-list:**
- First request after a restart pays a `jwks()` fetch. Warm the cache on
  startup if we ever see a cold-start latency complaint.
- `@lru_cache(maxsize=1)` is process-local. Each uvicorn worker fetches its
  own copy. Fine at current scale; revisit if we shard across many workers
  behind a shared cache.
- `python-jose` cannot encode HS256 with an RSA public key, so the canonical
  algorithm-confusion attack can't be scripted directly in unit tests. We
  compensate with `test_hs256_env_rejected_at_import` verifying the
  module-level guard and a string-secret HS256 negative test.

## Frontend refresh path

The frontend (`src/api/authFetch.ts`) delegates the actual token refresh to
`supabase.auth.refreshSession()`. We do **not** implement a homegrown refresh
path against the Supabase REST endpoint.

Rationale:
- Supabase's SDK already serialises concurrent refresh calls internally.
- A homegrown refresh duplicates cookie / localStorage handling that the SDK
  owns, and gets out of sync on every SDK upgrade.

`_refreshInFlight: Promise<void> | null` inside `authFetch` is a defensive
single-flight latch on top of the SDK's own serialisation, not a replacement
for it. If the refresh promise rejects we sign out and redirect to `/login`
exactly once — the latch is cleared inside the IIFE's `finally` so no waiter
observes a stale rejected promise.

## Alternatives deferred (PR 2+)

- **Row-level security (RLS) on the Postgres migration.** Currently the
  `profiles` table is keyed on `user_id` and we trust the application layer
  to pass the right id. PR 2 migrates to Postgres and enables RLS so the
  database itself refuses cross-tenant reads.
- **`/signout-all` real implementation.** The endpoint exists but is a no-op
  until we wire it to Supabase admin API (needs `service_role` key, which is
  out of scope for PR 1).
- **Sentry + rate limiting on the 401 path.** PR 3.
