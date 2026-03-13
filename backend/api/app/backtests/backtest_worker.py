# api/backtests/backtest_worker.py
from __future__ import annotations

import os
import threading
from typing import Any, Dict, Optional

from api.app.backtests.ema_scan_runner import run_ema_scan_subprocess
from api.app.backtests.job_store import get_job, update_job


def _scrub_banner_lines(text: str) -> str:
    """
    Avoid leaking server paths. Your runner prints:
      run_dir: ...
      log_path: ...
      report_path: ...
    Replace with safe placeholders.
    """
    out = []
    for line in (text or "").splitlines():
        s = line.strip()
        if s.startswith("run_dir:"):
            out.append("run_dir: (server)")
            continue
        if s.startswith("log_path:"):
            out.append("log_path: run.json.gz")
            continue
        if s.startswith("report_path:"):
            out.append("report_path: report.txt")
            continue
        out.append(line)
    return "\n".join(out)


def _basename(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    try:
        return os.path.basename(str(p).strip().rstrip("/\\"))
    except Exception:
        return None


def _result_payload(sp: Dict[str, Any]) -> Dict[str, Any]:
    parsed = (sp or {}).get("parsed") or {}
    run_id = _basename(parsed.get("run_dir"))

    return {
        "headline": "Backtest complete",
        "banner": {"run_id": run_id, "artifacts": ["report.txt", "run.json.gz"]},
        "terminal": {
            "stdout_tail": _scrub_banner_lines((sp or {}).get("stdout_tail") or ""),
            "stderr_tail": (sp or {}).get("stderr_tail") or "",
        },
        "notes": [
            "Runner executed server-side using your Alpaca keys injected into the subprocess env.",
            "Downloads fetch artifacts from your run.",
        ],
        "artifacts": {
            "report_txt": bool(parsed.get("report_path")),
            "run_json_gz": bool(parsed.get("log_path")),
            "trades_csv": False,
        },
    }


def _error_payload(sp: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "title": "Backtest failed",
        "message": f"returncode={sp.get('returncode')}",
        "returncode": sp.get("returncode"),
        "terminal": {
            "stdout_tail": _scrub_banner_lines((sp or {}).get("stdout_tail") or ""),
            "stderr_tail": (sp or {}).get("stderr_tail") or "",
        },
    }


def _run_job(*, job_id: str, repo_root: str, env_inject: Dict[str, str]) -> None:
    job = get_job(job_id)
    if not job:
        return

    update_job(job_id, status="running")

    cfg = job.config or {}

    try:
        sp = run_ema_scan_subprocess(
            repo_root=repo_root,
            symbols=list(cfg.get("symbols") or []),
            tf_entry=str(cfg.get("tf_entry") or ""),
            tf_bias=str(cfg.get("tf_bias") or ""),
            start=str(cfg.get("start") or ""),
            end=str(cfg.get("end") or ""),
            warmup=int(cfg.get("warmup") or 320),
            steps=int(cfg.get("steps") or 200000),
            qty=int(cfg.get("qty") or 1),
            feed=cfg.get("feed"),
            env_inject=env_inject,
        )

        parsed = (sp or {}).get("parsed") or {}

        if sp.get("ok"):
            update_job(
                job_id,
                status="done",
                result=_result_payload(sp),
                run_dir=parsed.get("run_dir"),
                log_path=parsed.get("log_path"),
                report_path=parsed.get("report_path"),
            )
        else:
            update_job(
                job_id,
                status="failed",
                error=_error_payload(sp),
                run_dir=parsed.get("run_dir"),
                log_path=parsed.get("log_path"),
                report_path=parsed.get("report_path"),
            )
    except Exception as e:
        update_job(job_id, status="failed", error={"title": "Exception", "message": repr(e)})


def start_backtest_job(*, job_id: str, repo_root: str, env_inject: Dict[str, str]) -> None:
    t = threading.Thread(
        target=_run_job,
        kwargs={"job_id": job_id, "repo_root": repo_root, "env_inject": env_inject},
        daemon=True,
    )
    t.start()