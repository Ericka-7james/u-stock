# backend/api/routes/backtests.py
from __future__ import annotations

import os
import threading
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse

from api.deps import require_user
from api.alpaca_auth import get_alpaca_credentials

from api.app.backtests.job_store import create_job, get_job, update_job, public_view, assert_owner
from api.app.backtests.ema_scan_runner import run_ema_scan_subprocess

router = APIRouter(prefix="/backtests", tags=["backtests"])


def _repo_root() -> str:
    root = os.environ.get("USTOCK_BOTS_REPO_ROOT", "").strip()
    root = os.path.abspath(root)
    if not root or not os.path.isdir(root):
        raise HTTPException(
            status_code=500,
            detail="Server backtest runner not configured (USTOCK_BOTS_REPO_ROOT).",
        )
    return root


def _int(v: Any, default: int) -> int:
    try:
        return int(v)
    except Exception:
        return int(default)


def _safe_tf(tf: str) -> str:
    tf = str(tf or "").strip()
    allowed = {"1Min", "5Min", "15Min", "30Min", "1Hour", "1Day"}
    if tf not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {tf}")
    return tf


def _safe_symbols(symbols: List[str]) -> List[str]:
    out: List[str] = []
    for s in symbols or []:
        t = str(s or "").strip().upper()
        if not t:
            continue
        if not t.replace("-", "").replace(".", "").isalnum():
            raise HTTPException(status_code=400, detail=f"Invalid symbol: {t}")
        out.append(t)
    if not out:
        raise HTTPException(status_code=400, detail="Add at least one symbol.")
    return out[:25]


def _alpaca_env_inject_for_runner(*, user_id: str) -> Dict[str, str]:
    api_key, api_secret, mode = get_alpaca_credentials(user_id)
    return {
        "ALPACA_API_KEY": api_key,
        "ALPACA_API_SECRET": api_secret,
        "ALPACA_MODE": mode,
        # common naming too
        "ALPACA_API_KEY_ID": api_key,
        "ALPACA_API_SECRET_KEY": api_secret,
    }


@router.post("/run")
def run_backtest(request: Request, response: Response, payload: Dict[str, Any]):
    u = require_user(request, response)
    user_id = u["id"]

    kind = str((payload or {}).get("kind") or "ema_scan").strip()
    if kind != "ema_scan":
        raise HTTPException(status_code=400, detail="Only kind=ema_scan is supported right now.")

    cfg = (payload or {}).get("config") or {}

    symbols = _safe_symbols(cfg.get("symbols") or [])
    tf_entry = _safe_tf(cfg.get("tf_entry"))
    tf_bias = _safe_tf(cfg.get("tf_bias"))
    start = str(cfg.get("start") or "").strip()
    end = str(cfg.get("end") or "").strip()

    if not start or not end:
        raise HTTPException(status_code=400, detail="Start and end are required.")

    warmup = max(0, _int(cfg.get("warmup"), 320))
    steps = max(1, _int(cfg.get("steps"), 200000))
    qty = max(1, _int(cfg.get("qty"), 1))
    feed = cfg.get("feed", None)

    job = create_job(
        user_id=user_id,
        kind=kind,
        config={
            "symbols": symbols,
            "tf_entry": tf_entry,
            "tf_bias": tf_bias,
            "start": start,
            "end": end,
            "warmup": warmup,
            "steps": steps,
            "qty": qty,
            "feed": feed,
            "provider": "alpaca",
        },
    )

    t = threading.Thread(target=_run_job, args=(job.id,), daemon=True)
    t.start()

    return {"ok": True, "job_id": job.id}


@router.get("/{job_id}")
def get_backtest_status(request: Request, response: Response, job_id: str):
    u = require_user(request, response)
    user_id = u["id"]

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    try:
        assert_owner(job, user_id)
    except PermissionError:
        raise HTTPException(status_code=404, detail="Job not found.")

    out = public_view(job)
    out["artifacts"] = {
        "report_txt": bool(job.report_path and os.path.exists(job.report_path)),
        "run_json_gz": bool(job.log_path and os.path.exists(job.log_path)),
    }
    return out


@router.get("/{job_id}/artifact/{name}")
def download_artifact(request: Request, response: Response, job_id: str, name: str):
    u = require_user(request, response)
    user_id = u["id"]

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Not found.")

    try:
        assert_owner(job, user_id)
    except PermissionError:
        raise HTTPException(status_code=404, detail="Not found.")

    if name == "report.txt":
        p = job.report_path
        filename = "report.txt"
    elif name == "run.json.gz":
        p = job.log_path
        filename = "run.json.gz"
    else:
        raise HTTPException(status_code=400, detail="Unknown artifact.")

    if not p or not os.path.exists(p):
        raise HTTPException(status_code=404, detail="Artifact not available.")

    root = _repo_root()
    allowed_root = os.path.abspath(os.path.join(root, ".cache", "backtests"))
    abs_p = os.path.abspath(p)
    if not abs_p.startswith(allowed_root):
        raise HTTPException(status_code=403, detail="Artifact path not allowed.")

    return FileResponse(abs_p, filename=filename, media_type="application/octet-stream")


def _run_job(job_id: str) -> None:
    job = get_job(job_id)
    if not job:
        return

    update_job(job_id, status="running")

    try:
        root = _repo_root()
        env_inject = _alpaca_env_inject_for_runner(user_id=job.user_id)

        cfg = job.config
        out = run_ema_scan_subprocess(
            repo_root=root,
            symbols=cfg["symbols"],
            tf_entry=cfg["tf_entry"],
            tf_bias=cfg["tf_bias"],
            start=cfg["start"],
            end=cfg["end"],
            warmup=int(cfg["warmup"]),
            steps=int(cfg["steps"]),
            qty=int(cfg["qty"]),
            feed=cfg.get("feed"),
            env_inject=env_inject,
        )

        parsed = out.get("parsed") or {}
        run_dir_rel = parsed.get("run_dir")
        log_rel = parsed.get("log_path")
        report_rel = parsed.get("report_path")

        run_dir = os.path.abspath(os.path.join(root, run_dir_rel)) if run_dir_rel else None
        log_path = os.path.abspath(os.path.join(root, log_rel)) if log_rel else None
        report_path = os.path.abspath(os.path.join(root, report_rel)) if report_rel else None

        if not out.get("ok"):
            update_job(
                job_id,
                status="failed",
                run_dir=run_dir,
                log_path=log_path,
                report_path=report_path,
                error={
                    "message": "Backtest failed.",
                    "returncode": out.get("returncode"),
                    "stderr_tail": out.get("stderr_tail"),
                },
                result=None,
            )
            return

        update_job(
            job_id,
            status="done",
            run_dir=run_dir,
            log_path=log_path,
            report_path=report_path,
            result={
                "headline": "Backtest complete",
                "downloads": {
                    "report_txt": f"/api/backtests/{job_id}/artifact/report.txt",
                    "run_json_gz": f"/api/backtests/{job_id}/artifact/run.json.gz",
                },
                "stdout_tail": out.get("stdout_tail"),
            },
            error=None,
        )

    except HTTPException as he:
        update_job(job_id, status="failed", error={"message": str(he.detail)})
    except Exception:
        update_job(job_id, status="failed", error={"message": "Server error while running backtest."})