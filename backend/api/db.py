# api/db.py
from __future__ import annotations

import os
from fastapi import HTTPException
from supabase import Client, create_client


def get_supabase_anon() -> Client:
    url = os.getenv("SUPABASE_URL", "").strip()
    anon = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not url:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not anon:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is missing")
    return create_client(url, anon)


def get_supabase_service() -> Client:
    url = os.getenv("SUPABASE_URL", "").strip()
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not service:
        raise HTTPException(status_code=500, detail="SUPABASE_SERVICE_ROLE_KEY is missing")
    return create_client(url, service)

