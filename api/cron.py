import os
import subprocess
from fastapi import APIRouter, Request, HTTPException
from pathlib import Path

router = APIRouter(prefix="/cron", tags=["cron"])


def _require_json(request: Request) -> None:
    ctype = (request.headers.get("content-type") or "").lower()
    # Accept "application/json" and "application/json; charset=utf-8"
    if not ctype.startswith("application/json"):
        raise HTTPException(
            status_code=415,
            detail="Unsupported Media Type. Use Content-Type: application/json",
        )


def _run(cmd: list[str]) -> dict:
    """
    Run a command and capture stdout/stderr for debugging.
    Ensures src/ is on PYTHONPATH so 'data_scout' imports work.
    """
    project_root = Path(__file__).resolve().parents[1]  # .../u-stock
    src_path = str(project_root / "src")

    env = dict(os.environ)
    env["PYTHONPATH"] = src_path + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")

    p = subprocess.run(cmd, capture_output=True, text=True, env=env)
    return {
        "cmd": cmd,
        "returncode": p.returncode,
        "stdout": (p.stdout or "")[-4000:],
        "stderr": (p.stderr or "")[-4000:],
        "PYTHONPATH": env.get("PYTHONPATH", ""),
    }


@router.post("/market-snapshot")
def run_market_snapshot(request: Request):
    expected = os.getenv("PIPELINE_SECRET", "").strip()
    provided = (request.headers.get("x-pipeline-secret") or "").strip()

    if not expected or provided != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    if request.method != "POST":
        raise HTTPException(status_code=405, detail="method_not_allowed")

    _require_json(request)

    steps = [
        ["python", "-m", "data_scout.fetchers.fetch_prices"],
        ["python", "-m", "data_scout.fetchers.fetch_intraday"],
        ["python", "-m", "data_scout.fetchers.fetch_fundamentals"],
        ["python", "-m", "data_scout.fetchers.fetch_quotes"],
        ["python", "-m", "data_scout.fetchers.upload_to_supabase", "."],
    ]

    results = []
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
            }

    return {
        "ok": True,
        "job": "market-snapshot",
        "status": "success",
        "steps": results,
    }
