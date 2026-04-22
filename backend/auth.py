"""
Supabase JWT verification for FastAPI.

Module-level fail-fast: SUPABASE_URL must be set in the environment at import
time. A missing value raises KeyError and crashes the worker at boot, which
is louder and safer than a soft default.

Design reference: docs/adr/001-auth-jwks.md (and the PR1 auth architecture
design doc in the Obsidian vault).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import Header, HTTPException
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError, JWTError


# ---------------------------------------------------------------------------
# Module-level configuration
# ---------------------------------------------------------------------------

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
if not SUPABASE_URL.startswith("https://"):
    raise RuntimeError(
        f"SUPABASE_URL must use https:// scheme, got: {SUPABASE_URL}"
    )

SUPABASE_JWT_AUD: str = os.environ.get("SUPABASE_JWT_AUD", "authenticated")
SUPABASE_JWT_ALGS: list[str] = [
    alg.strip()
    for alg in os.environ.get("SUPABASE_JWT_ALGS", "RS256,ES256").split(",")
    if alg.strip()
]

# Hard-reject HS256 at import to prevent algorithm-confusion attacks. If the
# JWKS is served as an RSA key but the decoder is told HS256 is acceptable,
# an attacker can sign forged tokens using the public key bytes as the HMAC
# secret. We do not support HS256; no legacy projects to accommodate.
if "HS256" in SUPABASE_JWT_ALGS:
    raise RuntimeError(
        "HS256 is forbidden (algorithm confusion risk). Set SUPABASE_JWT_ALGS "
        "to RS256 or ES256 only."
    )


def _jwks_url() -> str:
    """Re-derive from SUPABASE_URL on every call to respect monkeypatches in tests."""
    return f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"


def _issuer() -> str:
    """Re-derive from SUPABASE_URL on every call to respect monkeypatches in tests."""
    return f"{SUPABASE_URL}/auth/v1"


# ---------------------------------------------------------------------------
# UserContext
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class UserContext:
    """Immutable subject derived from a verified Supabase JWT."""
    user_id: str
    email: Optional[str] = None
    roles: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# JWKS fetch (singleton-cached via lru_cache)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def jwks() -> dict:
    """
    Fetch the Supabase JWKS document.

    Cached via lru_cache(maxsize=1) so the HTTP round-trip happens once per
    process. Tests monkeypatch this function directly; they also replace its
    cache_clear attribute.

    Invalidation: verify_jwt() calls jwks.cache_clear() on an unknown-kid
    decode failure, then retries once. That handles Supabase signing-key
    rotation without manual intervention.
    """
    resp = httpx.get(_jwks_url(), timeout=10.0)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Verifier helpers
# ---------------------------------------------------------------------------

def _kid_in_jwks(token_kid: Optional[str], jwks_doc: dict) -> bool:
    """Return True iff the token's kid header matches some key in the JWKS."""
    if not token_kid:
        return False
    keys = jwks_doc.get("keys", []) if isinstance(jwks_doc, dict) else []
    return any(k.get("kid") == token_kid for k in keys if isinstance(k, dict))


def _decode_with(jwks_doc: dict, token: str) -> dict:
    """Decode a JWT against the supplied JWKS with strict claim validation."""
    return jwt.decode(
        token,
        jwks_doc,
        algorithms=SUPABASE_JWT_ALGS,
        audience=SUPABASE_JWT_AUD,
        issuer=_issuer(),
        options={
            "verify_signature": True,
            "verify_aud": True,
            "verify_iss": True,
            "verify_exp": True,
            "verify_nbf": True,
            "verify_iat": True,
        },
    )


def verify_jwt(token: str) -> UserContext:
    """
    Verify a Supabase JWT and return the derived UserContext.

    Raises:
        ExpiredSignatureError: token past its exp claim.
        JWTClaimsError:        aud/iss/etc. fail validation.
        JWTError:              malformed token, bad signature, unknown kid
                               (after one cache-bust retry).
    """
    # Read the token header without verifying so we can sanity-check the kid
    # against the cached JWKS before attempting a full decode.
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        unverified_header = {}
    token_kid = unverified_header.get("kid") if isinstance(unverified_header, dict) else None

    jwks_doc = jwks()

    # Unknown-kid fast path: bust the cache and re-fetch before the first
    # decode attempt. This lets us handle Supabase signing-key rotation
    # deterministically rather than relying on error-message sniffing.
    if token_kid is not None and not _kid_in_jwks(token_kid, jwks_doc):
        jwks.cache_clear()
        jwks_doc = jwks()

    claims = _decode_with(jwks_doc, token)

    sub = claims.get("sub")
    if not sub:
        raise JWTClaimsError("missing sub claim")

    email = claims.get("email")
    app_metadata = claims.get("app_metadata") or {}
    roles_raw = app_metadata.get("roles", []) if isinstance(app_metadata, dict) else []
    roles = list(roles_raw) if isinstance(roles_raw, list) else []

    return UserContext(user_id=str(sub), email=email, roles=roles)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def current_user(
    authorization: Optional[str] = Header(None),
) -> UserContext:
    """
    FastAPI dependency that resolves the current Supabase user from the
    Authorization header. Raises HTTPException(401) on any failure.

    Note: Header(None), not Header(...). We want consistent 401s for the
    frontend's authFetch retry logic — 422 would break its state machine.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")

    # Intentionally opaque detail strings: leaking python-jose internal error
    # text creates a claim-probing oracle (wrong-aud vs wrong-iss vs bad
    # signature). Server-side logging of the original exception is deferred
    # to the observability PR.
    try:
        return verify_jwt(token)
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token expired")
    except JWTClaimsError:
        raise HTTPException(status_code=401, detail="invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token")
