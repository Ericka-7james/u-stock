# backend/api/backtests/backtests_router.py
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backend.api.backtests.job_store import (
    assert_owner,
    create_job,
    get_job,
    public_view,
)
from backend.api.backtests.backtest_worker import start_job


router = APIRouter(prefix="/api/backtests", tags=["backtests"])


# ----------------------------
# Auth hooks (replace as needed)
# ----------------------------
def get_user_id() -> str:
    """
    Replace this with your real auth dependency.
    Must return a stable user_id string.
    """
    # e.g. from JWT claims
    raise NotImplementedError("Wire get_user_id() to your auth system")


def get_user_alpaca_env(user_id: str) -> Dict[str, str]:
    """
    Replace this with your real credential store lookup.
    Return env vars to inject into subprocess.
    These should be PER-USER and ephemeral (not persisted into job).
    """
    # Example keys (change to match your runner expectations):
    # ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_PAPER, etc.
    raise NotImplementedError("Wire get_user_alpaca_env() to your credential store")


def get_repo_root() -> str:
    """
    Path where `python -m runner.backtest.run_ema_scan_backtest` can be executed.
    In dev, this might be the u-stock-bots repo root.
    """
    # Option 1: explicit env var
    rr = os.environ.get("USTOCK_BOTS_REPO_ROOT")
    if rr:
        return rr

    # Option 2: relative guess (adjust if your backend lives elsewhere)
    # This assumes backend is adjacent to u-stock-bots.
    here = os.path.dirname(os.path.abspath(__file__))
    guess = os.path.abspath(os.path.join(here, "..", "..", "..", "..", "u-stock-bots"))
    return guess


# ----------------------------
# Request validation
# ----------------------------
def _as_int(x: Any, fallback: int) -> int:
    try:
        return int(x)
    except Exception:
        return int(fallback)


def _require_str(x: Any, field: str) -> str:
    s = str(x or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail=f"Missing field: {field}")
    return s


def _require_symbols(x: Any) -> list[str]:
    if not isinstance(x, list):
        raise HTTPException(status_code=400, detail="symbols must be a list of strings")
    out: list[str] = []
    for s in x:
        t = str(s or "").strip().upper()
        if t:
            out.append(t)
    if not out:
        raise HTTPException(status_code=400, detail="symbols must not be empty")
    return out[:25]


@router.post("/run")
def run_backtest(payload: Dict[str, Any], user_id: str = Depends(get_user_id)) -> Dict[str, Any]:
    """
    Body example:
    {
      "kind": "ema_scan",
      "symbols": ["SPY","QQQ"],
      "tf_entry": "5Min",
      "tf_bias": "15Min",
      "start": "2023-08-01",
      "end": "2024-02-01",
      "warmup": 320,
      "steps": 200000,
      "qty": 1,
      "feed": null
    }
    """
    kind = str(payload.get("kind") or "ema_scan")
    if kind != "ema_scan":
        raise HTTPException(status_code=400, detail="Unsupported kind")

    config = {
        "symbols": _require_symbols(payload.get("symbols")),
        "tf_entry": _require_str(payload.get("tf_entry"), "tf_entry"),
        "tf_bias": _require_str(payload.get("tf_bias"), "tf_bias"),
        "start": _require_str(payload.get("start"), "start"),
        "end": _require_str(payload.get("end"), "end"),
        "warmup": _as_int(payload.get("warmup"), 320),
        "steps": _as_int(payload.get("steps"), 200000),
        "qty": _as_int(payload.get("qty"), 1),
        "feed": payload.get("feed"),
    }

    job = create_job(user_id=user_id, kind=kind, config=config)

    repo_root = get_repo_root()
    env_inject = get_user_alpaca_env(user_id)

    # fire background thread
    start_job(job_id=job.id, repo_root=repo_root, env_inject=env_inject)

    return public_view(job)


@router.get("/{job_id}")
def get_backtest(job_id: str, user_id: str = Depends(get_user_id)) -> Dict[str, Any]:
    job = get_job(job_id)
    try:
        assert_owner(job, user_id)
    except PermissionError:
        raise HTTPException(status_code=404, detail="Not found")
    if not job:
        raise HTTPException(status_code=404, detail="Not found")
    return public_view(job)


@router.get("/{job_id}/artifacts/{name}")
def download_artifact(
    job_id: str,
    name: str,
    user_id: str = Depends(get_user_id),
):
    """
    name is one of:
      - report.txt
      - run.json.gz
    Later:
      - trades.csv
    """
    job = get_job(job_id)
    try:
        assert_owner(job, user_id)
    except PermissionError:
        raise HTTPException(status_code=404, detail="Not found")
    if not job:
        raise HTTPException(status_code=404, detail="Not found")

    if job.status != "done":
        raise HTTPException(status_code=409, detail="Backtest not complete")

    # Map requested name -> job server-only path
    if name == "report.txt":
        path = job.report_path
        download_name = "report.txt"
        media_type = "text/plain"
    elif name in ("run.json.gz", "run.json"):
        path = job.log_path
        download_name = "run.json.gz"
        media_type = "application/gzip"
    elif name == "trades.csv":
        # wire later when you generate it
        raise HTTPException(status_code=404, detail="Not available yet")
    else:
        raise HTTPException(status_code=404, detail="Unknown artifact")

    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Artifact missing")

    return FileResponse(
        path=path,
        filename=download_name,
        media_type=media_type,
    )