# backend/api/security/tests/test_crypto.py
from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

import api.security.crypto as mod


@pytest.fixture(autouse=True)
def clear_fernet_cache():
    # Ensure each test gets a clean _fernet() cache
    mod._fernet.cache_clear()
    yield
    mod._fernet.cache_clear()


def test_encrypt_returns_none_for_none(monkeypatch):
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", Fernet.generate_key().decode("utf-8"))
    assert mod.encrypt_secret(None) is None


def test_encrypt_returns_none_for_empty_string(monkeypatch):
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", Fernet.generate_key().decode("utf-8"))
    assert mod.encrypt_secret("") is None


def test_decrypt_returns_none_for_none(monkeypatch):
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", Fernet.generate_key().decode("utf-8"))
    assert mod.decrypt_secret(None) is None


def test_decrypt_returns_none_for_empty_string(monkeypatch):
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", Fernet.generate_key().decode("utf-8"))
    assert mod.decrypt_secret("") is None


def test_missing_key_raises_500(monkeypatch):
    monkeypatch.delenv("INTEGRATIONS_ENC_KEY", raising=False)

    with pytest.raises(HTTPException) as e:
        mod.encrypt_secret("hello")
    assert e.value.status_code == 500
    assert "INTEGRATIONS_ENC_KEY is missing" in str(e.value.detail)


def test_invalid_key_raises_500(monkeypatch):
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", "not-a-real-fernet-key")

    with pytest.raises(HTTPException) as e:
        mod.encrypt_secret("hello")
    assert e.value.status_code == 500
    assert "INTEGRATIONS_ENC_KEY is invalid" in str(e.value.detail)


def test_encrypt_then_decrypt_roundtrip(monkeypatch):
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key)

    token = mod.encrypt_secret("super-secret")
    assert isinstance(token, str)
    assert token != "super-secret"

    plain = mod.decrypt_secret(token)
    assert plain == "super-secret"


def test_decrypt_invalid_token_returns_400(monkeypatch):
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key)

    with pytest.raises(HTTPException) as e:
        mod.decrypt_secret("not-a-fernet-token")
    assert e.value.status_code == 400
    assert e.value.detail == "Invalid encrypted secret"


def test_cached_fernet_uses_first_loaded_key(monkeypatch):
    # First key
    key1 = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key1)

    token = mod.encrypt_secret("abc")

    # Change env var after cache was created
    key2 = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key2)

    # Because of cache, decrypt should still work with the original Fernet instance
    assert mod.decrypt_secret(token) == "abc"
