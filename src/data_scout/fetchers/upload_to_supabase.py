from __future__ import annotations

import os
from pathlib import Path
import mimetypes
import requests

# -----------------------------
# Config
# -----------------------------

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB (Supabase free plan)

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
# Helpers
# -----------------------------

def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_project_root() -> Path:
    # upload_to_supabase.py
    # parents[0] = fetchers
    # parents[1] = data_scout
    # parents[2] = src
    # parents[3] = project root
    return Path(__file__).resolve().parents[3]


def fetched_dir() -> Path:
    return get_project_root() / "public" / "data" / "fetched"


def upload_file(
    *,
    supabase_url: str,
    service_role_key: str,
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
            f"[upload] File too large for Supabase free plan: "
            f"{local_path.name} ({size} bytes)"
        )

    mime_type, _ = mimetypes.guess_type(str(local_path))
    if not mime_type:
        mime_type = "application/octet-stream"

    url = (
        f"{supabase_url.rstrip('/')}"
        f"/storage/v1/object/{bucket}/{remote_path}"
    )

    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": service_role_key,
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

    print(
        f"[upload] Success ({size} bytes): "
        f"{bucket}/{remote_path}"
    )


# -----------------------------
# Entrypoint
# -----------------------------

def main() -> None:
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    bucket = require_env("SUPABASE_BUCKET")

    base_dir = fetched_dir()

    for local_name, remote_path in UPLOAD_TARGETS:
        upload_file(
            supabase_url=supabase_url,
            service_role_key=service_role_key,
            bucket=bucket,
            local_path=base_dir / local_name,
            remote_path=remote_path,
        )


if __name__ == "__main__":
    main()
