from __future__ import annotations

import os
from fastapi import HTTPException
from supabase import Client, create_client


def _get_env(name: str) -> str:
    return os.getenv(name, "").strip()


def _create(url: str, key: str, label: str) -> Client:
    try:
        return create_client(url, key)
    except Exception as e:
        # Keep error readable but not too verbose
        raise HTTPException(status_code=500, detail=f"Supabase client init failed ({label}): {type(e).__name__}")


def get_supabase_anon() -> Client:
    url = _get_env("SUPABASE_URL")
    anon = _get_env("SUPABASE_ANON_KEY")
    if not url:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not anon:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is missing")
    return _create(url, anon, "anon")


def get_supabase_service() -> Client:
    url = _get_env("SUPABASE_URL")
    service = _get_env("SUPABASE_SERVICE_ROLE_KEY")
    print("SERVICE KEY PRESENT?", bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY")))
    if not url:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not service:
        raise HTTPException(status_code=500, detail="SUPABASE_SERVICE_ROLE_KEY is missing")
    return _create(url, service, "service")
