# backend/api/routes/health.py
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["health"])


def _backend_root() -> Path:
    # .../backend
    return Path(__file__).resolve().parents[2]


def _env_name() -> str:
    # IMPORTANT: default is development, and we strip/lower
    return os.getenv("ENV", "development").strip().lower()


def _read_json_file(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in health file: {e.msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read health file: {repr(e)}")


@router.get("/health")
def health():
    """
    Lightweight liveness probe.
    Keep this fast and dependency-free (no DB calls).
    """
    return {"ok": True, "status": "ok", "env": _env_name(), "ts": int(time.time())}


@router.get("/health/market-snapshot")
def market_snapshot_health(
    stale_after_seconds: int = 6 * 60 * 60,  # 6 hours default
):
    """
    Health info for scheduled market snapshot job.

    Expects a JSON file at:
      backend/public/data/fetched/market-snapshot-health.json

    Returns ok=false if:
      - file missing
      - file invalid
      - file is stale (based on ts/updated_at if present)
    """
    path = _backend_root() / "public" / "data" / "fetched" / "market-snapshot-health.json"

    if not path.exists():
        # keep 200 so health dashboards can parse payload consistently
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "status": "missing",
                "env": _env_name(),
                "error": "health file not found yet",
                "path": str(path),
                "ts": int(time.time()),
            },
        )

    data = _read_json_file(path)

    # Determine freshness. Support common shapes:
    # - { ts: 1234567890 }
    # - { updated_at: "2026-01-01T12:34:56Z" } (we won't parse, just rely on ts if present)
    now = int(time.time())
    ts_val: Optional[int] = None

    if isinstance(data, dict):
        raw_ts = data.get("ts")
        if isinstance(raw_ts, (int, float)):
            ts_val = int(raw_ts)
        else:
            # some jobs write nested objects
            meta = data.get("meta")
            if isinstance(meta, dict) and isinstance(meta.get("ts"), (int, float)):
                ts_val = int(meta["ts"])

    age_seconds: Optional[int] = None
    stale = False
    if ts_val is not None and ts_val > 0:
        age_seconds = max(0, now - ts_val)
        stale = age_seconds > int(stale_after_seconds)

    # Normalize response shape
    out: Dict[str, Any] = {
        "ok": bool(data.get("ok")) if isinstance(data, dict) and "ok" in data else True,
        "status": data.get("status") if isinstance(data, dict) else "ok",
        "env": _env_name(),
        "path": str(path),
        "ts": now,
        "file": data,
    }

    if ts_val is not None:
        out["freshness"] = {
            "file_ts": ts_val,
            "age_seconds": age_seconds,
            "stale_after_seconds": int(stale_after_seconds),
            "stale": stale,
        }
        if stale:
            out["ok"] = False
            out["status"] = "stale"

    return out
