# backend/api/security/tests/test_bot_runner_token.py
from __future__ import annotations

import time

import jwt
import pytest

import api.security.bot_runner_token as mod


def _fresh_times(ttl: int = 600) -> tuple[int, int]:
    now = int(time.time())
    return now, now + ttl


def test_load_bot_runner_config_requires_secret(monkeypatch):
    monkeypatch.delenv("BOT_RUNNER_JWT_SECRET", raising=False)
    monkeypatch.setenv("BOT_RUNNER_JWT_TTL_SECONDS", "900")

    with pytest.raises(RuntimeError) as e:
        mod.load_bot_runner_config()
    assert "BOT_RUNNER_JWT_SECRET is not set" in str(e.value)


def test_load_bot_runner_config_validates_ttl_int(monkeypatch):
    monkeypatch.setenv("BOT_RUNNER_JWT_SECRET", "secret")
    monkeypatch.setenv("BOT_RUNNER_JWT_TTL_SECONDS", "nope")

    with pytest.raises(RuntimeError) as e:
        mod.load_bot_runner_config()
    assert "BOT_RUNNER_JWT_TTL_SECONDS must be an int" in str(e.value)


def test_load_bot_runner_config_validates_ttl_positive(monkeypatch):
    monkeypatch.setenv("BOT_RUNNER_JWT_SECRET", "secret")
    monkeypatch.setenv("BOT_RUNNER_JWT_TTL_SECONDS", "0")

    with pytest.raises(RuntimeError) as e:
        mod.load_bot_runner_config()
    assert "BOT_RUNNER_JWT_TTL_SECONDS must be > 0" in str(e.value)


def test_mint_bot_runner_token_requires_user_id():
    cfg = mod.BotRunnerTokenConfig(secret="s", ttl_seconds=60, issuer="iss")
    with pytest.raises(ValueError):
        mod.mint_bot_runner_token("   ", cfg)


def test_mint_and_verify_roundtrip_success():
    cfg = mod.BotRunnerTokenConfig(secret="secret", ttl_seconds=900, issuer="u-stock-backend")
    minted = mod.mint_bot_runner_token("user-123", cfg)
    assert "token" in minted
    assert minted["expires_in"] == 900

    payload = mod.verify_bot_runner_token(minted["token"], cfg)
    assert payload["sub"] == "user-123"
    assert payload["iss"] == "u-stock-backend"
    assert payload["scope"] == "bot:run"
    assert isinstance(payload["iat"], int)
    assert isinstance(payload["exp"], int)
    assert payload["exp"] > payload["iat"]


def test_verify_rejects_wrong_scope():
    cfg = mod.BotRunnerTokenConfig(secret="secret", ttl_seconds=900, issuer="u-stock-backend")
    now, exp = _fresh_times(ttl=600)

    token = jwt.encode(
        {"iss": cfg.issuer, "sub": "user-123", "scope": "nope", "iat": now, "exp": exp},
        cfg.secret,
        algorithm="HS256",
    )

    with pytest.raises(jwt.InvalidTokenError) as e:
        mod.verify_bot_runner_token(token, cfg)
    assert "Invalid scope" in str(e.value)


def test_verify_rejects_wrong_issuer():
    cfg = mod.BotRunnerTokenConfig(secret="secret", ttl_seconds=900, issuer="u-stock-backend")
    now, exp = _fresh_times(ttl=600)

    token = jwt.encode(
        {"iss": "someone-else", "sub": "user-123", "scope": "bot:run", "iat": now, "exp": exp},
        cfg.secret,
        algorithm="HS256",
    )

    with pytest.raises(jwt.InvalidIssuerError):
        mod.verify_bot_runner_token(token, cfg)


def test_verify_rejects_expired_token():
    cfg = mod.BotRunnerTokenConfig(secret="secret", ttl_seconds=1, issuer="u-stock-backend")
    now = int(time.time())

    token = jwt.encode(
        # expired a while ago
        {"iss": cfg.issuer, "sub": "user-123", "scope": "bot:run", "iat": now - 1000, "exp": now - 500},
        cfg.secret,
        algorithm="HS256",
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        mod.verify_bot_runner_token(token, cfg)


def test_verify_rejects_wrong_secret():
    cfg_good = mod.BotRunnerTokenConfig(secret="secretA", ttl_seconds=900, issuer="u-stock-backend")
    cfg_bad = mod.BotRunnerTokenConfig(secret="secretB", ttl_seconds=900, issuer="u-stock-backend")

    minted = mod.mint_bot_runner_token("user-123", cfg_good)

    with pytest.raises(jwt.InvalidTokenError):
        mod.verify_bot_runner_token(minted["token"], cfg_bad)
