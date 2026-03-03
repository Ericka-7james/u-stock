from __future__ import annotations

import time
import uuid
import threading
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class BacktestJob:
    id: str
    user_id: str
    kind: str  # "ema_scan"
    status: str  # queued|running|done|failed
    created_at: float
    updated_at: float

    # safe config (no secrets)
    config: Dict[str, Any]

    # safe payloads for UI
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None

    # server-only resolved artifact paths
    run_dir: Optional[str] = None
    log_path: Optional[str] = None
    report_path: Optional[str] = None


_LOCK = threading.Lock()
_JOBS: Dict[str, BacktestJob] = {}


def create_job(*, user_id: str, kind: str, config: Dict[str, Any]) -> BacktestJob:
    jid = uuid.uuid4().hex
    now = time.time()
    job = BacktestJob(
        id=jid,
        user_id=user_id,
        kind=kind,
        status="queued",
        created_at=now,
        updated_at=now,
        config=config,
    )
    with _LOCK:
        _JOBS[jid] = job
    return job


def get_job(job_id: str) -> Optional[BacktestJob]:
    with _LOCK:
        return _JOBS.get(job_id)


def update_job(job_id: str, **patch: Any) -> Optional[BacktestJob]:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        for k, v in patch.items():
            setattr(job, k, v)
        job.updated_at = time.time()
        return job


def assert_owner(job: Optional[BacktestJob], user_id: str) -> None:
    if not job or job.user_id != user_id:
        # don’t reveal existence
        raise PermissionError("Not allowed")


def public_view(job: BacktestJob) -> Dict[str, Any]:
    """
    Never return server paths. Never return secrets.
    """
    return {
        "id": job.id,
        "kind": job.kind,
        "status": job.status,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "config": job.config,
        "result": job.result,
        "error": job.error,
    }