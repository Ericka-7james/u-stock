from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


def upload_file_to_supabase_storage(
    *,
    local_path: Path,
    bucket: str,
    object_path: str,
    content_type: str = "application/json",
    upsert: bool = True,
    supabase_url: Optional[str] = None,
    supabase_key: Optional[str] = None,
) -> None:
    """
    Upload a local file to Supabase Storage.

    ✅ Server-only: use SUPABASE_SECRET_KEY (preferred) or legacy SUPABASE_SERVICE_ROLE_KEY.
    🚫 Never use these keys in the browser.
    """
    from supabase import create_client  # lazy import

    url = supabase_url or os.environ.get("SUPABASE_URL")

    # Prefer new key, fallback to legacy for compatibility
    key = (
        supabase_key
        or os.environ.get("SUPABASE_SECRET_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )

    if not url or not key:
        raise RuntimeError(
            "Missing SUPABASE_URL and a server key. "
            "Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY (legacy)."
        )

    if not local_path.exists():
        raise RuntimeError(f"Local file does not exist: {local_path}")

    client = create_client(url, key)
    data = local_path.read_bytes()

    res = client.storage.from_(bucket).upload(
        path=object_path,
        file=data,
        file_options={"content-type": content_type, "upsert": upsert},
    )

    if res is None:
        raise RuntimeError("Supabase upload returned None (unexpected).")
