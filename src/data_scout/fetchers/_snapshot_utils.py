from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


SNAPSHOT_VERSION = 1


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def parse_iso_utc(ts: str) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def get_project_root() -> Path:
    """
    This file lives at: src/data_scout/fetchers/_snapshot_utils.py
    parents[0] -> fetchers
    parents[1] -> data_scout
    parents[2] -> src
    parents[3] -> project root
    """
    return Path(__file__).resolve().parents[3]


def chunked(seq: List[str], size: int) -> List[List[str]]:
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except Exception:
        return default


@dataclass(frozen=True)
class SnapshotSpec:
    dataset: str
    interval: Optional[str] = None  # e.g. "1d", "2m", "5m", "15m"


def snapshot_path(dataset: str, *, interval: Optional[str] = None) -> Path:
    """
    Standard snapshot location:
      public/data/fetched/<dataset>.json
      public/data/fetched/<dataset>-<interval>.json (if interval is provided)
    """
    root = get_project_root()
    fetched_dir = root / "public" / "data" / "fetched"
    if interval:
        return fetched_dir / f"{dataset}-{interval}.json"
    return fetched_dir / f"{dataset}.json"


def snapshot_is_fresh(path: Path, max_age_minutes: int) -> bool:
    payload = read_json(path)
    if not payload:
        return False

    ts_str = payload.get("generated_at")
    if not ts_str:
        return False

    ts = parse_iso_utc(ts_str)
    if not ts:
        return False

    cutoff = utc_now() - timedelta(minutes=max_age_minutes)
    return ts >= cutoff


def build_snapshot_wrapper(
    *,
    spec: SnapshotSpec,
    symbols: List[str],
    data_key: str,
    data: Dict[str, Any],
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    wrapper: Dict[str, Any] = {
        "version": SNAPSHOT_VERSION,
        "dataset": spec.dataset,
        "generated_at": utc_now_iso(),
        "symbols": symbols,
        data_key: data,
    }
    if spec.interval:
        wrapper["interval"] = spec.interval
    if meta:
        wrapper["meta"] = meta
    return wrapper
