from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class SnapshotMeta:
    dataset: str
    interval: Optional[str]
    source: str
    stale_after_minutes: int


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(ts: str) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def snapshot_is_fresh(path: Path, stale_after_minutes: int) -> bool:
    """
    Freshness check based on standardized snapshot schema:
      payload["meta"]["generatedAt"]
    """
    if not path.exists():
        return False

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        meta = payload.get("meta") or {}
        ts_str = meta.get("generatedAt")
        if not ts_str:
            return False
        ts = _parse_iso(ts_str)
        if ts is None:
            return False
    except Exception:
        return False

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=stale_after_minutes)
    return ts >= cutoff


def write_snapshot_json(
    *,
    path: Path,
    meta: SnapshotMeta,
    symbols: list[str],
    data: Dict[str, Any],
    extra_meta: Optional[Dict[str, Any]] = None,
) -> None:
    payload: Dict[str, Any] = {
        "meta": {
            "dataset": meta.dataset,
            "interval": meta.interval,
            "generatedAt": _utc_now_iso(),
            "universeSize": len(symbols),
            "source": meta.source,
            "staleAfterMinutes": meta.stale_after_minutes,
        },
        "symbols": symbols,
        "data": data,
    }

    if extra_meta:
        payload["meta"].update(extra_meta)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
