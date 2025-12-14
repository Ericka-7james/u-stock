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

    Requires:
      pip install supabase

    IMPORTANT:
      Use SUPABASE_SERVICE_ROLE_KEY for CI uploads (GitHub Actions).
      Do NOT put service role key in the browser / client.
    """
    from supabase import create_client  # lazy import

    url = supabase_url or os.environ.get("SUPABASE_URL")
    key = supabase_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
        )

    client = create_client(url, key)

    data = local_path.read_bytes()
    res = client.storage.from_(bucket).upload(
        path=object_path,
        file=data,
        file_options={"content-type": content_type, "upsert": upsert},
    )

    # supabase-py returns different shapes across versions; do a minimal guard:
    if res is None:
        raise RuntimeError("Supabase upload returned None (unexpected).")
