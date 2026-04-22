"""
Pytest fixtures for backend auth tests.

backend/auth.py fails fast on missing SUPABASE_URL at import time, so we seed
the env before importing. The import is still guarded for the (rare) case
where auth.py has a real ImportError in a working tree.
"""
import base64
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

# Seed env before importing backend.auth. `setdefault` keeps any real value
# already in the environment (e.g. if the dev is running the suite with a
# live Supabase URL) and only fills in the blank for a fresh shell.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")

try:
    import backend.auth as _auth_module
except (ImportError, KeyError):
    _auth_module = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _int_to_base64url(n: int) -> str:
    """Encode a large integer as base64url with no padding."""
    byte_length = (n.bit_length() + 7) // 8
    raw = n.to_bytes(byte_length, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _build_jwks_from_public_key(public_key, kid: str) -> dict:
    """Return a JWKS dict in Supabase's shape for a single RSA public key."""
    numbers = public_key.public_key().public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": kid,
                "n": _int_to_base64url(numbers.n),
                "e": _int_to_base64url(numbers.e),
            }
        ]
    }


def _generate_rsa_keypair(kid: str) -> dict:
    """Generate an RSA-2048 keypair and return PEMs + kid."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return {"private_pem": private_pem, "public_pem": public_pem, "kid": kid, "_private_key": private_key}


# ---------------------------------------------------------------------------
# Session-scoped keypair fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def rsa_keypair() -> dict:
    """Primary RSA-2048 keypair used to sign valid test tokens."""
    return _generate_rsa_keypair("test-kid-1")


@pytest.fixture(scope="session")
def alt_rsa_keypair() -> dict:
    """Secondary RSA-2048 keypair used for bad-signature and unknown-kid tests."""
    return _generate_rsa_keypair("test-kid-2")


@pytest.fixture(scope="session")
def supabase_test_url() -> str:
    return "https://test.supabase.co"


@pytest.fixture(scope="session")
def jwks_dict(rsa_keypair: dict) -> dict:
    """JWKS dict built from the primary keypair in Supabase's shape."""
    return _build_jwks_from_public_key(rsa_keypair["_private_key"], rsa_keypair["kid"])


# ---------------------------------------------------------------------------
# Token factory
# ---------------------------------------------------------------------------

def _sign_token(keypair: dict, kid: str, overrides: dict, base_iss: str) -> str:
    """
    Sign a JWT with the given RSA private key (RS256).

    Default claims (each can be overridden via `overrides`):
      aud  = "authenticated"
      iss  = base_iss + "/auth/v1"
      sub  = random UUID
      exp  = now + 1h
      iat  = now
      nbf  = now
    """
    from jose import jwt as jose_jwt

    now = datetime.now(tz=timezone.utc)
    defaults = {
        "aud": "authenticated",
        "iss": base_iss + "/auth/v1",
        "sub": str(uuid4()),
        "email": "test@example.com",
        "exp": now + timedelta(hours=1),
        "iat": now,
        "nbf": now,
    }
    # Do not mutate the caller's overrides dict. Reusing a shared dict across
    # multiple _sign_token calls must not change its contents.
    algorithm = overrides.get("_algorithm", "RS256")
    claim_overrides = {k: v for k, v in overrides.items() if k != "_algorithm"}
    claims = {**defaults, **claim_overrides}

    return jose_jwt.encode(
        claims,
        keypair["private_pem"],
        algorithm=algorithm,
        headers={"kid": kid},
    )


@pytest.fixture(scope="session")
def token_factory(rsa_keypair: dict, supabase_test_url: str):
    """
    Session-scoped factory.  Call as:
        token = token_factory(overrides={...})
        token = token_factory(keypair=alt_rsa_keypair, kid="other-kid", overrides={...})
    """
    def factory(keypair=None, kid=None, overrides=None):
        kp = keypair if keypair is not None else rsa_keypair
        k = kid if kid is not None else kp["kid"]
        ov = overrides or {}
        return _sign_token(kp, k, ov, supabase_test_url)

    return factory


# ---------------------------------------------------------------------------
# FastAPI test app (registered here so conftest owns it, not test_auth.py)
# ---------------------------------------------------------------------------

def _build_test_app():
    """
    Build a tiny FastAPI app with a single protected route for auth tests.

    Returns None if backend.auth is not available yet (RED phase).
    """
    if _auth_module is None:
        return None

    from fastapi import Depends, FastAPI

    test_app = FastAPI()

    @test_app.get("/whoami")
    def whoami(user=Depends(_auth_module.current_user)):
        return {
            "user_id": user.user_id,
            "email": user.email,
            "roles": user.roles,
        }

    return test_app


_test_app = _build_test_app()


# ---------------------------------------------------------------------------
# patch_auth — function-scoped autouse fixture
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def patch_auth(monkeypatch, jwks_dict: dict, supabase_test_url: str):
    """
    Monkeypatch backend.auth module-level state for every test function.

    - Sets SUPABASE_URL to supabase_test_url.
    - Replaces backend.auth.jwks (the lru_cache-wrapped function) so it
      returns jwks_dict without making an HTTP call.

    Skips gracefully if backend.auth is not importable yet.
    """
    if _auth_module is None:
        return  # Nothing to patch; tests will skip themselves.

    monkeypatch.setattr(_auth_module, "SUPABASE_URL", supabase_test_url)

    # Replace the JWKS fetcher with a simple lambda that returns the test dict.
    # We also expose cache_clear so the retry logic in verify_jwt can call it.
    # A per-fixture `_clear_count` counter lets tests read cache_clear
    # invocation count without re-monkeypatching the attribute (which would
    # be order-sensitive against this autouse fixture).
    def _fake_jwks():
        return jwks_dict

    _fake_jwks._clear_count = 0

    def _fake_cache_clear():
        _fake_jwks._clear_count += 1

    _fake_jwks.cache_clear = _fake_cache_clear

    monkeypatch.setattr(_auth_module, "jwks", _fake_jwks)


# ---------------------------------------------------------------------------
# Client fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    """
    Bare TestClient with no auth header.  Used for negative (unauthenticated) tests.
    Skips if backend.auth (and therefore the test app) is unavailable.
    """
    if _test_app is None:
        pytest.skip("backend.auth not implemented yet")
    from fastapi.testclient import TestClient
    return TestClient(_test_app, raise_server_exceptions=False)


@pytest.fixture()
def authed_client(token_factory):
    """
    TestClient that injects a valid Authorization: Bearer <token> header on
    every request by default.  Skips if backend.auth is unavailable.
    """
    if _test_app is None:
        pytest.skip("backend.auth not implemented yet")
    from fastapi.testclient import TestClient

    valid_token = token_factory()
    return TestClient(
        _test_app,
        headers={"Authorization": f"Bearer {valid_token}"},
        raise_server_exceptions=False,
    )


# ---------------------------------------------------------------------------
# Real-app client fixtures (backend.main.app)
# ---------------------------------------------------------------------------
#
# The real FastAPI app mounts every non-/health route behind a router with
# `dependencies=[Depends(current_user)]`. Tests that probe those protected
# routes need the bearer header attached automatically; a bare TestClient
# returns 401 before the handler ever runs.
#
# These fixtures rely on the same `patch_auth` autouse fixture above to
# monkeypatch `backend.auth.jwks()` so no network call is made.

@pytest.fixture()
def main_app():
    """
    Import and return `backend.main.app`. Skips if backend.auth is unavailable
    (backend.main imports backend.auth at module load).
    """
    if _auth_module is None:
        pytest.skip("backend.auth not implemented yet")
    from backend.main import app as _main_app
    return _main_app


@pytest.fixture()
def main_client(main_app):
    """
    Bare TestClient against the real backend app. No auth header attached —
    only useful for /health and similar unauthenticated routes.
    """
    from fastapi.testclient import TestClient
    return TestClient(main_app, raise_server_exceptions=False)


@pytest.fixture()
def main_authed_client(main_app, token_factory):
    """
    TestClient against the real backend app (`backend.main.app`) with a valid
    bearer token attached to every request. Use this for any test that hits a
    protected route after the auth cutover in backend/main.py.
    """
    from fastapi.testclient import TestClient

    valid_token = token_factory()
    return TestClient(
        main_app,
        headers={"Authorization": f"Bearer {valid_token}"},
        raise_server_exceptions=False,
    )
