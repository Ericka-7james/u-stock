# backend/api/supabase_client.py
from __future__ import annotations

import os
from functools import lru_cache

from supabase import Client, create_client


def _must_env(name: str) -> str:
    v = (os.getenv(name) or "").strip()
    if not v:
        raise RuntimeError(f"Missing required env var: {name}")
    return v


@lru_cache(maxsize=1)
def supabase_service_client() -> Client:
    """
    Service-role client (bypasses RLS). Use ONLY on backend / trusted server routes.
    """
    url = _must_env("SUPABASE_URL")
    key = _must_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


@lru_cache(maxsize=1)
def supabase_user_client() -> Client:
    """
    "User" client (RLS applies) IF you actually use a real user JWT (not done here).
    Minimal compatibility:
    - Uses SUPABASE_ANON_KEY if present
    - Falls back to service role in dev to avoid crashing
    """
    url = _must_env("SUPABASE_URL")
    anon = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
    if anon:
        return create_client(url, anon)
    return supabase_service_client()


# -------------------------------------------------------------------
# Compatibility aliases (so routes can import whatever name they expect)
# -------------------------------------------------------------------

def supabase_admin_client() -> Client:
    # many codebases call the service-role client "admin"
    return supabase_service_client()


def supabase_client() -> Client:
    # generic name some routes may import
    return supabase_service_client()


__all__ = [
    "supabase_service_client",
    "supabase_user_client",
    "supabase_admin_client",
    "supabase_client",
]
