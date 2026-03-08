from __future__ import annotations

import os
import re
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
        "ALPACA_API_KEY_ID": api_key,
        "ALPACA_API_SECRET_KEY": api_secret,
    }


def _read_text_if_exists(path: Optional[str]) -> str:
    if not path or not os.path.exists(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""


def _find_first_number(patterns: List[str], text: str, cast=float):
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE | re.MULTILINE)
        if m:
            raw = (m.group(1) or "").strip().replace(",", "")
            try:
                return cast(raw)
            except Exception:
                continue
    return None


def _parse_report_summary(report_path: Optional[str]) -> Dict[str, Any]:
    text = _read_text_if_exists(report_path)
    if not text:
        return {
            "trades": None,
            "win_rate": None,
            "pnl": None,
            "max_drawdown": None,
            "avg_trade": None,
            "exposure": None,
        }

    trades = _find_first_number(
        [
            r"^\s*trades\s*[:=]\s*([-+]?\d+)",
            r"^\s*total\s+trades\s*[:=]\s*([-+]?\d+)",
            r"^\s*#\s*trades\s*[:=]\s*([-+]?\d+)",
        ],
        text,
        cast=int,
    )

    win_rate_pct = _find_first_number(
        [
            r"^\s*win[_\s-]*rate\s*[:=]\s*([-+]?\d*\.?\d+)\s*%",
            r"^\s*win\s*rate\s*[:=]\s*([-+]?\d*\.?\d+)\s*%",
        ],
        text,
        cast=float,
    )
    win_rate_ratio = _find_first_number(
        [
            r"^\s*win[_\s-]*rate\s*[:=]\s*([-+]?\d*\.?\d+)",
            r"^\s*win\s*rate\s*[:=]\s*([-+]?\d*\.?\d+)",
        ],
        text,
        cast=float,
    )

    pnl = _find_first_number(
        [
            r"^\s*(?:net\s+)?pnl\s*[:=]\s*\$?\s*([-+]?\d[\d,]*\.?\d*)",
            r"^\s*profit(?:/loss)?\s*[:=]\s*\$?\s*([-+]?\d[\d,]*\.?\d*)",
            r"^\s*net\s+profit\s*[:=]\s*\$?\s*([-+]?\d[\d,]*\.?\d*)",
        ],
        text,
        cast=float,
    )

    max_drawdown_pct = _find_first_number(
        [
            r"^\s*max[_\s-]*drawdown\s*[:=]\s*([-+]?\d*\.?\d+)\s*%",
            r"^\s*max\s+dd\s*[:=]\s*([-+]?\d*\.?\d+)\s*%",
        ],
        text,
        cast=float,
    )
    max_drawdown_ratio = _find_first_number(
        [
            r"^\s*max[_\s-]*drawdown\s*[:=]\s*([-+]?\d*\.?\d+)",
            r"^\s*max\s+dd\s*[:=]\s*([-+]?\d*\.?\d+)",
        ],
        text,
        cast=float,
    )

    avg_trade = _find_first_number(
        [
            r"^\s*avg[_\s-]*trade\s*[:=]\s*\$?\s*([-+]?\d[\d,]*\.?\d*)",
            r"^\s*average\s+trade\s*[:=]\s*\$?\s*([-+]?\d[\d,]*\.?\d*)",
        ],
        text,
        cast=float,
    )

    exposure_pct = _find_first_number(
        [
            r"^\s*exposure\s*[:=]\s*([-+]?\d*\.?\d+)\s*%",
        ],
        text,
        cast=float,
    )
    exposure_ratio = _find_first_number(
        [
            r"^\s*exposure\s*[:=]\s*([-+]?\d*\.?\d+)",
        ],
        text,
        cast=float,
    )

    win_rate = None
    if win_rate_pct is not None:
        win_rate = win_rate_pct / 100.0
    elif win_rate_ratio is not None:
        win_rate = win_rate_ratio if win_rate_ratio <= 1.0 else win_rate_ratio / 100.0

    max_drawdown = None
    if max_drawdown_pct is not None:
        max_drawdown = max_drawdown_pct / 100.0
    elif max_drawdown_ratio is not None:
        max_drawdown = (
            max_drawdown_ratio if abs(max_drawdown_ratio) <= 1.0 else max_drawdown_ratio / 100.0
        )

    exposure = None
    if exposure_pct is not None:
        exposure = exposure_pct / 100.0
    elif exposure_ratio is not None:
        exposure = exposure_ratio if abs(exposure_ratio) <= 1.0 else exposure_ratio / 100.0

    return {
        "trades": trades,
        "win_rate": win_rate,
        "pnl": pnl,
        "max_drawdown": max_drawdown,
        "avg_trade": avg_trade,
        "exposure": exposure,
    }


def _extract_block(text: str, start_pat: str, end_pat: Optional[str] = None) -> str:
    m = re.search(start_pat, text, flags=re.IGNORECASE | re.MULTILINE)
    if not m:
        return ""
    start = m.end()
    tail = text[start:]
    if end_pat:
        m2 = re.search(end_pat, tail, flags=re.IGNORECASE | re.MULTILINE)
        if m2:
            return tail[: m2.start()].strip()
    return tail.strip()


def _clean_lines(block: str) -> List[str]:
    return [ln.rstrip() for ln in block.splitlines() if ln.strip()]


def _parse_stdout_overview(stdout_tail: Optional[str], *, job_id: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    text = str(stdout_tail or "").strip()

    universe_raw = None
    m_universe = re.search(r"^\s*universe:\s*(.+)$", text, flags=re.IGNORECASE | re.MULTILINE)
    if m_universe:
        universe_raw = m_universe.group(1).strip()

    tf_line = None
    m_tf = re.search(
        r"^\s*tf_entry=(.+?)\s+tf_bias=(.+?)\s+start=(.+?)\s+end=(.+?)\s+feed=(.+?)\s*$",
        text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    if m_tf:
        tf_line = {
            "tf_entry": m_tf.group(1).strip(),
            "tf_bias": m_tf.group(2).strip(),
            "start": m_tf.group(3).strip(),
            "end": m_tf.group(4).strip(),
            "feed": m_tf.group(5).strip(),
        }

    top_intents_block = _extract_block(
        text,
        r"^\s*\(top\s+5\s+best\s+intents\)\s*$",
        r"^\s*===\s*SUMMARY\s*===\s*$",
    )
    top_intents_lines = _clean_lines(top_intents_block)

    summary_block = _extract_block(text, r"^\s*===\s*SUMMARY\s*===\s*$")
    summary_lines = _clean_lines(summary_block)

    confidence_breakdown: List[str] = []
    summary_lines_no_conf: List[str] = []

    conf_started = False
    for ln in summary_lines:
        if re.search(r"^\s*confidence\s+breakdown", ln, flags=re.IGNORECASE):
            conf_started = True
            continue

        if conf_started:
            confidence_breakdown.append(ln)
        else:
            summary_lines_no_conf.append(ln)

    errors_count = _find_first_number([r"^\s*errors\s*:\s*([-+]?\d+)"], text, cast=int)

    last_lines: List[str] = []
    all_lines = _clean_lines(text)
    if all_lines:
        last_lines = all_lines[-10:]

    return {
        "job_id": job_id,
        "universe": cfg.get("symbols") or universe_raw,
        "config_line": {
            "tf_entry": cfg.get("tf_entry"),
            "tf_bias": cfg.get("tf_bias"),
            "start": cfg.get("start"),
            "end": cfg.get("end"),
            "feed": cfg.get("feed"),
        }
        if cfg
        else tf_line,
        "top_intents": top_intents_lines[:12],
        "last_lines": last_lines,
        "summary_lines": summary_lines_no_conf[:16],
        "confidence_breakdown": confidence_breakdown[:8],
        "errors": errors_count,
        "stdout_tail": text,
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

        summary = _parse_report_summary(report_path)
        overview = _parse_stdout_overview(
            out.get("stdout_tail"),
            job_id=job_id,
            cfg=cfg,
        )

        update_job(
            job_id,
            status="done",
            run_dir=run_dir,
            log_path=log_path,
            report_path=report_path,
            result={
                "headline": "Backtest complete",
                "summary": summary,
                "overview": overview,
                "notes": [
                    "Backtest finished successfully.",
                    "Download the report or raw run log below for deeper inspection.",
                ],
                "artifacts": {
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