from __future__ import annotations

import pytest
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

import api.crypto_utils as mod


def test_encrypt_returns_none_for_none(monkeypatch):
    monkeypatch.delenv("INTEGRATIONS_ENC_KEY", raising=False)
    assert mod.encrypt_secret(None) is None


def test_encrypt_returns_none_for_blank_string(monkeypatch):
    monkeypatch.delenv("INTEGRATIONS_ENC_KEY", raising=False)
    assert mod.encrypt_secret("") is None
    assert mod.encrypt_secret("   ") is None
    assert mod.encrypt_secret("\n\t") is None


def test_decrypt_returns_none_for_none(monkeypatch):
    monkeypatch.delenv("INTEGRATIONS_ENC_KEY", raising=False)
    assert mod.decrypt_secret(None) is None


def test_decrypt_returns_none_for_blank_string(monkeypatch):
    monkeypatch.delenv("INTEGRATIONS_ENC_KEY", raising=False)
    assert mod.decrypt_secret("") is None
    assert mod.decrypt_secret("   ") is None
    assert mod.decrypt_secret("\n\t") is None


def test_fernet_raises_500_when_env_missing(monkeypatch):
    monkeypatch.delenv("INTEGRATIONS_ENC_KEY", raising=False)

    with pytest.raises(HTTPException) as e:
        mod.encrypt_secret("hello")

    assert e.value.status_code == 500
    assert "INTEGRATIONS_ENC_KEY is missing" in str(e.value.detail)


def test_fernet_raises_500_when_env_invalid(monkeypatch):
    # Not a valid Fernet key (must be 44 chars urlsafe b64 for 32 bytes)
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", "not-a-fernet-key")

    with pytest.raises(HTTPException) as e:
        mod.encrypt_secret("hello")

    assert e.value.status_code == 500
    assert "INTEGRATIONS_ENC_KEY is invalid" in str(e.value.detail)
    # should mention type, e.g. ValueError
    assert "(" in str(e.value.detail) and ")" in str(e.value.detail)


def test_encrypt_decrypt_roundtrip_success(monkeypatch):
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key)

    token = mod.encrypt_secret("hello")
    assert isinstance(token, str)
    assert token.strip() != ""

    plain = mod.decrypt_secret(token)
    assert plain == "hello"


def test_encrypt_strips_input(monkeypatch):
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key)

    token = mod.encrypt_secret("   hello   ")
    assert mod.decrypt_secret(token) == "hello"


def test_decrypt_raises_when_token_invalid(monkeypatch):
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key)

    # garbage token should raise cryptography InvalidToken
    # (your decrypt_secret does not catch it; that's OK—caller can handle)
    with pytest.raises(InvalidToken):
        mod.decrypt_secret("not-a-valid-fernet-token")


def test_decrypt_fails_with_wrong_key(monkeypatch):
    key1 = Fernet.generate_key().decode("utf-8")
    key2 = Fernet.generate_key().decode("utf-8")

    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key1)
    token = mod.encrypt_secret("hello")

    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key2)
    with pytest.raises(InvalidToken):
        mod.decrypt_secret(token)
