# src/data_scout/fetchers/upload_to_supabase.py
from __future__ import annotations

import os
from pathlib import Path
import mimetypes
import requests

from dotenv import load_dotenv

# -----------------------------
# Config
# -----------------------------

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

# Files we expect fetchers to generate
# (local filename → remote storage path)
UPLOAD_TARGETS = [
    ("prices.json", "snapshots/prices.json"),
    ("fundamentals.json", "snapshots/fundamentals.json"),
    ("intraday-2m.json", "snapshots/intraday-2m.json"),
    ("intraday-5m.json", "snapshots/intraday-5m.json"),
    ("intraday-15m.json", "snapshots/intraday-15m.json"),
    ("quotes.json", "snapshots/quotes.json"),
]

# -----------------------------
# Env loading (LONG-TERM FIX)
# -----------------------------


def get_project_root() -> Path:
    # upload_to_supabase.py
    # parents[0] = fetchers
    # parents[1] = data_scout
    # parents[2] = src
    # parents[3] = project root
    return Path(__file__).resolve().parents[3]


def _load_env_files() -> None:
    """
    Loads env files so running this script directly (or via python -m ...)
    does NOT depend on shell session env vars.

    Order: base first, then local overrides.
    """
    root = get_project_root()
    candidates = [
        root / ".env",
        root / ".env.local",
        root / "api" / ".env",
        root / "api" / ".env.local",
    ]
    for p in candidates:
        if p.exists():
            load_dotenv(p, override=False)


_load_env_files()

# -----------------------------
# Helpers
# -----------------------------


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


def fetched_dir() -> Path:
    return get_project_root() / "public" / "data" / "fetched"


def _pick_supabase_key() -> str:
    """
    Prefer new key names if present:
      - SUPABASE_SECRET_KEY (sb_secret_...) for server scripts
    Fallback to legacy:
      - SUPABASE_SERVICE_ROLE_KEY (JWT service_role) if you still use it
    """
    k = (os.getenv("SUPABASE_SECRET_KEY") or "").strip()
    if k:
        return k
    k = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if k:
        return k
    raise RuntimeError(
        "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment."
    )


def _debug_env() -> None:
    # helpful when running locally — avoids “why is it empty”
    url = (os.getenv("SUPABASE_URL") or "").strip()
    bucket = (os.getenv("SUPABASE_BUCKET") or "").strip()
    secret = (os.getenv("SUPABASE_SECRET_KEY") or "").strip()
    service = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

    def _mask(v: str) -> str:
        if not v:
            return "NOT_SET"
        if len(v) <= 10:
            return v[:2] + "…" + v[-2:]
        return v[:6] + "…" + v[-4:]

    print("[env] SUPABASE_URL:", url or "NOT_SET")
    print("[env] SUPABASE_BUCKET:", bucket or "NOT_SET")
    print("[env] SUPABASE_SECRET_KEY:", _mask(secret))
    print("[env] SUPABASE_SERVICE_ROLE_KEY:", _mask(service))


def _list_buckets(*, supabase_url: str, supabase_key: str) -> list[dict]:
    """
    Calls Storage API to list buckets so we can confirm bucket ID.
    """
    url = f"{supabase_url.rstrip('/')}/storage/v1/bucket"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }
    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code >= 300:
        raise RuntimeError(f"[bucket] List buckets failed ({r.status_code}): {r.text}")
    data = r.json()
    return data if isinstance(data, list) else []


def _ensure_bucket_exists(*, supabase_url: str, supabase_key: str, bucket: str) -> None:
    """
    Supabase Storage uses a bucket *id* (usually lowercase, no spaces).
    Your dashboard may show a friendly display name. If the ID differs,
    uploads will 404/“Bucket not found”.

    This check prints the available bucket IDs to make it obvious.
    """
    buckets = _list_buckets(supabase_url=supabase_url, supabase_key=supabase_key)
    ids = [str(b.get("id") or "") for b in buckets]
    if bucket not in ids:
        pretty = ", ".join([i for i in ids if i]) or "(none returned)"
        raise RuntimeError(
            f"[bucket] Bucket not found: '{bucket}'. Available bucket ids: {pretty}\n"
            f"Tip: SUPABASE_BUCKET must match the bucket 'id' exactly (not the UI display name)."
        )


def upload_file(
    *,
    supabase_url: str,
    supabase_key: str,
    bucket: str,
    local_path: Path,
    remote_path: str,
) -> None:
    if not local_path.exists():
        print(f"[upload] Skipping missing file: {local_path.name}")
        return

    size = local_path.stat().st_size
    if size > MAX_FILE_SIZE_BYTES:
        raise RuntimeError(
            f"[upload] File too large: {local_path.name} ({size} bytes)"
        )

    mime_type, _ = mimetypes.guess_type(str(local_path))
    if not mime_type:
        mime_type = "application/octet-stream"

    # Storage upload endpoint (PUT object)
    url = (
        f"{supabase_url.rstrip('/')}"
        f"/storage/v1/object/{bucket}/{remote_path}"
    )

    headers = {
        # IMPORTANT:
        # For hosted Supabase: send key via apikey header.
        # Authorization Bearer is also acceptable for Storage API.
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": mime_type,
        "x-upsert": "true",
    }

    print(f"[upload] Uploading {local_path.name} → {bucket}/{remote_path}")

    response = requests.put(
        url,
        headers=headers,
        data=local_path.read_bytes(),
        timeout=60,
    )

    if response.status_code >= 300:
        raise RuntimeError(
            f"[upload] Upload failed ({response.status_code}): {response.text}"
        )

    print(f"[upload] Success ({size} bytes): {bucket}/{remote_path}")


# -----------------------------
# Entrypoint
# -----------------------------


def main() -> None:
    _debug_env()

    supabase_url = require_env("SUPABASE_URL")
    bucket = require_env("SUPABASE_BUCKET")
    supabase_key = _pick_supabase_key()

    # Validate bucket id early with a clear error
    _ensure_bucket_exists(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        bucket=bucket,
    )

    base_dir = fetched_dir()

    for local_name, remote_path in UPLOAD_TARGETS:
        upload_file(
            supabase_url=supabase_url,
            supabase_key=supabase_key,
            bucket=bucket,
            local_path=base_dir / local_name,
            remote_path=remote_path,
        )


if __name__ == "__main__":
    main()
