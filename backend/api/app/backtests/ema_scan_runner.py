from __future__ import annotations

import os
import subprocess
from typing import Any, Dict, List, Optional


def _py_exe() -> str:
    # Lets you override python path if needed (optional).
    return os.environ.get("PYTHON", os.sys.executable)


def _split_symbols(symbols: List[str]) -> str:
    return ",".join([str(s).strip().upper() for s in symbols if str(s).strip()])


def _parse_banner(stdout: str) -> Dict[str, Optional[str]]:
    """
    Your runner prints:
      run_dir: ...
      log_path: ...
      report_path: ...
    We parse those lines so the API knows where artifacts are.
    """
    run_dir = None
    log_path = None
    report_path = None

    for line in (stdout or "").splitlines():
        s = line.strip()
        if s.startswith("run_dir:"):
            run_dir = s.split("run_dir:", 1)[1].strip()
        elif s.startswith("log_path:"):
            log_path = s.split("log_path:", 1)[1].strip()
        elif s.startswith("report_path:"):
            report_path = s.split("report_path:", 1)[1].strip()

    return {"run_dir": run_dir, "log_path": log_path, "report_path": report_path}


def run_ema_scan_subprocess(
    *,
    repo_root: str,
    symbols: List[str],
    tf_entry: str,
    tf_bias: str,
    start: str,
    end: str,
    warmup: int,
    steps: int,
    qty: int,
    feed: Optional[str],
    env_inject: Dict[str, str],
) -> Dict[str, Any]:
    """
    Runs: python -m runner.backtest.run_ema_scan_backtest ...
    Injects per-user Alpaca creds into subprocess env (ephemeral).
    """
    cmd = [
        _py_exe(),
        "-m",
        "runner.backtest.run_ema_scan_backtest",
        "--symbols",
        _split_symbols(symbols),
        "--tf_entry",
        str(tf_entry),
        "--tf_bias",
        str(tf_bias),
        "--start",
        str(start),
        "--end",
        str(end),
        "--warmup",
        str(int(warmup)),
        "--steps",
        str(int(steps)),
        "--qty",
        str(int(qty)),
        "--report_top",
        "10",
        "--report_skips",
        "--report_intents",
        "--report_errors",
    ]

    if feed:
        cmd += ["--feed", str(feed)]

    env = os.environ.copy()
    for k, v in (env_inject or {}).items():
        if v is None:
            continue
        env[str(k)] = str(v)

    res = subprocess.run(
        cmd,
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )

    stdout = (res.stdout or "").strip()
    stderr = (res.stderr or "").strip()

    return {
        "ok": res.returncode == 0,
        "returncode": res.returncode,
        "stdout_tail": stdout[-12000:],
        "stderr_tail": stderr[-6000:],
        "parsed": _parse_banner(stdout),
    }