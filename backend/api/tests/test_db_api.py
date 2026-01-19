from __future__ import annotations

import pytest
from fastapi import HTTPException

import api.db as mod


def test_get_supabase_anon_missing_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")

    with pytest.raises(HTTPException) as e:
        mod.get_supabase_anon()

    assert e.value.status_code == 500
    assert e.value.detail == "SUPABASE_URL is missing"


def test_get_supabase_anon_missing_anon_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    with pytest.raises(HTTPException) as e:
        mod.get_supabase_anon()

    assert e.value.status_code == 500
    assert e.value.detail == "SUPABASE_ANON_KEY is missing"


def test_get_supabase_service_missing_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service")

    with pytest.raises(HTTPException) as e:
        mod.get_supabase_service()

    assert e.value.status_code == 500
    assert e.value.detail == "SUPABASE_URL is missing"


def test_get_supabase_service_missing_service_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    with pytest.raises(HTTPException) as e:
        mod.get_supabase_service()

    assert e.value.status_code == 500
    assert e.value.detail == "SUPABASE_SERVICE_ROLE_KEY is missing"


def test_get_supabase_anon_calls_create_client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")

    calls = {}

    def fake_create_client(url, key):
        calls["url"] = url
        calls["key"] = key
        return object()

    monkeypatch.setattr(mod, "create_client", fake_create_client)

    out = mod.get_supabase_anon()
    assert out is not None
    assert calls == {"url": "https://example.supabase.co", "key": "anon-key"}


def test_get_supabase_service_calls_create_client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")

    calls = {}

    def fake_create_client(url, key):
        calls["url"] = url
        calls["key"] = key
        return object()

    monkeypatch.setattr(mod, "create_client", fake_create_client)

    out = mod.get_supabase_service()
    assert out is not None
    assert calls == {"url": "https://example.supabase.co", "key": "service-key"}


def test_create_client_failure_becomes_http_500(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")

    def boom(url, key):
        raise RuntimeError("nope")

    monkeypatch.setattr(mod, "create_client", boom)

    with pytest.raises(HTTPException) as e:
        mod.get_supabase_anon()

    assert e.value.status_code == 500
    assert "Supabase client init failed (anon)" in str(e.value.detail)
