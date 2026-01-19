# api/cron.py
from __future__ import annotations

import os
import secrets
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/cron", tags=["cron"])

_MAX_LOG_CHARS = int(os.getenv("CRON_LOG_TAIL_CHARS", "4000"))
_STEP_TIMEOUT_SECONDS = int(os.getenv("CRON_STEP_TIMEOUT_SECONDS", "300"))  # 5 min default


def _require_json_content_type(request: Request) -> None:
    ctype = (request.headers.get("content-type") or "").lower()
    # Accept "application/json" and "application/json; charset=utf-8"
    if not ctype.startswith("application/json"):
        raise HTTPException(
            status_code=415,
            detail="Unsupported Media Type. Use Content-Type: application/json",
        )


async def _read_json_body(request: Request) -> Dict[str, Any]:
    """
    Ensures Content-Type is JSON and the payload parses as JSON object.
    We don't currently use the body, but this prevents accidental triggers
    with non-JSON or malformed JSON.
    """
    _require_json_content_type(request)
    try:
        data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {repr(e)}")

    if data is None:
        return {}
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON body must be an object")
    return data


def _run(cmd: List[str]) -> Dict[str, Any]:
    """
    Run a command and capture stdout/stderr for debugging.
    Ensures src/ is on PYTHONPATH so 'data_scout' imports work.
    """
    started = time.time()

    project_root = Path(__file__).resolve().parents[1]  # .../backend (if api/ is under backend/)
    # If your repo layout is different, adjust as needed.
    src_path = str(project_root / "src")

    env = dict(os.environ)
    env["PYTHONPATH"] = src_path + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")

    try:
        p = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=_STEP_TIMEOUT_SECONDS,
        )
        rc = p.returncode
        out = p.stdout or ""
        err = p.stderr or ""
        timed_out = False
    except subprocess.TimeoutExpired as e:
        rc = 124
        out = (e.stdout or "") if isinstance(e.stdout, str) else ""
        err = (e.stderr or "") if isinstance(e.stderr, str) else ""
        err = (err + "\n" + f"Timed out after {_STEP_TIMEOUT_SECONDS}s").strip()
        timed_out = True

    duration_ms = int((time.time() - started) * 1000)

    return {
        "cmd": cmd,
        "returncode": rc,
        "stdout": out[-_MAX_LOG_CHARS:],
        "stderr": err[-_MAX_LOG_CHARS:],
        "PYTHONPATH": env.get("PYTHONPATH", ""),
        "timed_out": timed_out,
        "duration_ms": duration_ms,
    }


@router.post("/market-snapshot")
async def run_market_snapshot(request: Request):
    expected = os.getenv("PIPELINE_SECRET", "").strip()
    provided = (request.headers.get("x-pipeline-secret") or "").strip()

    # If expected isn't set, always unauthorized (safe default)
    if not expected or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="unauthorized")

    # Validate JSON payload (even if unused)
    await _read_json_body(request)

    started_at = int(time.time())
    steps = [
        ["python", "-m", "data_scout.fetchers.fetch_prices"],
        ["python", "-m", "data_scout.fetchers.fetch_intraday"],
        ["python", "-m", "data_scout.fetchers.fetch_fundamentals"],
        ["python", "-m", "data_scout.fetchers.fetch_quotes"],
        ["python", "-m", "data_scout.fetchers.upload_to_supabase", "."],
    ]

    results: List[Dict[str, Any]] = []
    for cmd in steps:
        r = _run(cmd)
        results.append(r)
        if r["returncode"] != 0:
            return {
                "ok": False,
                "job": "market-snapshot",
                "status": "failure",
                "failed_step": cmd,
                "steps": results,
                "meta": {
                    "startedAt": started_at,
                    "finishedAt": int(time.time()),
                },
            }

    return {
        "ok": True,
        "job": "market-snapshot",
        "status": "success",
        "steps": results,
        "meta": {
            "startedAt": started_at,
            "finishedAt": int(time.time()),
        },
    }
