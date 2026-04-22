"""
Auth test suite for backend/auth.py — RED phase.

All tests target the tiny /whoami endpoint registered in conftest._test_app,
which applies current_user as a dependency.  No network calls to Supabase are
made; backend.auth.jwks is monkeypatched by the autouse patch_auth fixture.

All tests are expected to FAIL or SKIP until backend/auth.py is implemented.
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Guard: if backend.auth is unavailable, mark the whole module as expected to
# skip so collection does not error.
# ---------------------------------------------------------------------------

try:
    import backend.auth as _auth_module
except (ImportError, KeyError):
    _auth_module = None


def _skip_if_not_implemented():
    if _auth_module is None:
        pytest.skip("backend.auth not implemented yet")


# ---------------------------------------------------------------------------
# Happy-path
# ---------------------------------------------------------------------------

def test_valid_token_returns_200_with_claims(authed_client):
    """A well-formed RS256 token signed by the test keypair yields 200."""
    _skip_if_not_implemented()
    resp = authed_client.get("/whoami")
    assert resp.status_code == 200
    body = resp.json()
    assert "user_id" in body
    assert len(body["user_id"]) > 0


def test_valid_token_populates_roles_from_app_metadata(client, token_factory):
    """Roles embedded in app_metadata.roles are surfaced in UserContext."""
    _skip_if_not_implemented()
    token = token_factory(overrides={"app_metadata": {"roles": ["beta"]}})
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["roles"] == ["beta"]


def test_token_with_no_email_claim_returns_none(client, token_factory):
    """A token that omits the email claim should yield 200 with email=None."""
    _skip_if_not_implemented()
    token = token_factory(overrides={"email": None})
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] is None


# ---------------------------------------------------------------------------
# Token validation failures — 401 cases
# ---------------------------------------------------------------------------

def test_expired_token_returns_401(client, token_factory):
    """A token with exp in the past is rejected with 401 mentioning 'expired'."""
    _skip_if_not_implemented()
    past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
    token = token_factory(overrides={"exp": past})
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    detail = resp.json().get("detail", "")
    assert "expired" in detail.lower()


def test_wrong_audience_returns_401(client, token_factory):
    """A token with aud='service_role' is rejected with a sanitized 401."""
    _skip_if_not_implemented()
    token = token_factory(overrides={"aud": "service_role"})
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    # Detail is intentionally opaque to avoid a claim-probing oracle.
    assert resp.json().get("detail") == "invalid token"


def test_wrong_issuer_returns_401(client, token_factory):
    """A token with a non-Supabase issuer is rejected with a sanitized 401."""
    _skip_if_not_implemented()
    token = token_factory(overrides={"iss": "https://attacker.example"})
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    # Detail is intentionally opaque to avoid a claim-probing oracle.
    assert resp.json().get("detail") == "invalid token"


def test_no_authorization_header_returns_401(client):
    """Omitting the Authorization header entirely yields 401 mentioning missing or bearer."""
    _skip_if_not_implemented()
    resp = client.get("/whoami")
    assert resp.status_code == 401
    detail = resp.json().get("detail", "").lower()
    assert "missing" in detail or "bearer" in detail


def test_malformed_token_returns_401(client):
    """A non-JWT bearer value is rejected with 401."""
    _skip_if_not_implemented()
    resp = client.get("/whoami", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401


def test_bad_signature_returns_401(client, token_factory, alt_rsa_keypair, rsa_keypair):
    """
    Token signed by alt keypair but carrying the primary keypair's kid.
    The kid matches an entry in the JWKS, but the signature won't verify.
    """
    _skip_if_not_implemented()
    # Use alt keypair to sign, but present the primary kid so key lookup succeeds.
    token = token_factory(
        keypair=alt_rsa_keypair,
        kid=rsa_keypair["kid"],  # kid matches the JWKS, but signature is wrong
    )
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_unknown_kid_retries_then_401(client, token_factory, alt_rsa_keypair, jwks_dict):
    """
    Token with an unknown kid triggers cache_clear() + retry, then 401.

    The autouse patch_auth fixture installs a fake jwks() whose cache_clear
    increments `_fake_jwks._clear_count`. We read that counter directly
    rather than re-monkeypatching — that was order-sensitive against
    patch_auth and fragile.
    """
    _skip_if_not_implemented()

    if _auth_module is None:
        pytest.skip("backend.auth not implemented yet")

    # Snapshot the baseline; other tests in the session may have incremented
    # the counter. We want to observe the delta from this single request.
    baseline = getattr(_auth_module.jwks, "_clear_count", 0)

    # Token signed by alt keypair with a kid that does not appear in jwks_dict.
    token = token_factory(
        keypair=alt_rsa_keypair,
        kid="does-not-exist",
    )
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    after = getattr(_auth_module.jwks, "_clear_count", 0)
    assert after - baseline >= 1, "cache_clear() must be called on unknown-kid failure"


def test_missing_bearer_prefix_returns_401(client, token_factory):
    """Authorization header present but without 'Bearer ' prefix yields 401."""
    _skip_if_not_implemented()
    token = token_factory()
    # Send raw JWT with no "Bearer " prefix.
    resp = client.get("/whoami", headers={"Authorization": token})
    assert resp.status_code == 401
    detail = resp.json().get("detail", "").lower()
    assert "missing" in detail or "bearer" in detail


def test_hs256_token_rejected(client, rsa_keypair):
    """
    A token signed with HS256 must be rejected even if the kid matches an
    RS256 entry in the JWKS. Defends against algorithm-confusion attacks.

    Ideally we would sign with the RSA public key PEM as the HMAC secret
    (the true attack shape) — but python-jose refuses to construct that
    key, raising JWSError at sign time. A string secret is the next-best
    signal: the server must reject the token because HS256 is not in the
    accepted algorithms list. test_hs256_env_rejected_at_import covers
    the configuration-level defense.
    """
    _skip_if_not_implemented()
    from jose import jwt as jose_jwt
    from datetime import datetime, timedelta, timezone

    now = datetime.now(tz=timezone.utc)
    claims = {
        "aud": "authenticated",
        "iss": "https://test.supabase.co/auth/v1",
        "sub": "00000000-0000-0000-0000-000000000001",
        "email": "attacker@example.com",
        "exp": now + timedelta(hours=1),
        "iat": now,
        "nbf": now,
    }
    # Sign with a shared secret and embed the kid that matches the JWKS
    # RS256 entry. If HS256 were accepted, the server would look up the
    # kid's key and use it as the HMAC secret — which is the full attack.
    hs256_token = jose_jwt.encode(
        claims,
        "supersecret",
        algorithm="HS256",
        headers={"kid": rsa_keypair["kid"]},
    )
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {hs256_token}"})
    assert resp.status_code == 401


def test_hs256_env_rejected_at_import(monkeypatch):
    """
    Setting SUPABASE_JWT_ALGS=HS256 in the environment must fail loudly at
    module import. Belt-and-braces defense against a misconfiguration that
    would otherwise open the algorithm-confusion attack at runtime.
    """
    import importlib
    import sys

    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_ALGS", "RS256,HS256")

    # Force a fresh import; module may already be cached from other tests.
    if "backend.auth" in sys.modules:
        monkeypatch.delitem(sys.modules, "backend.auth", raising=False)

    with pytest.raises(RuntimeError, match="HS256 is forbidden"):
        importlib.import_module("backend.auth")
