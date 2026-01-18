# u-stock-bots/runner/supabase.py
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests

TRANSACTION_EVENT_TYPES = {
    "order_submitted",
    "order_filled",
    "order_partially_filled",
    "order_canceled",
    "order_rejected",
    "order_failed",
    "trade_closed",
}

DEFAULT_TABLE = "bot_events"
DEFAULT_BATCH_SIZE = 100
DEFAULT_TIMEOUT = 8


def sb_enabled() -> bool:
    return bool((os.getenv("SUPABASE_URL") or "").strip() and (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip())


def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _is_tx_event(evt: Dict[str, Any]) -> bool:
    return str(evt.get("event_type") or "").strip() in TRANSACTION_EVENT_TYPES


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _chunk(xs: List[Any], size: int) -> List[List[Any]]:
    if size <= 0:
        size = DEFAULT_BATCH_SIZE
    return [xs[i : i + size] for i in range(0, len(xs), size)]


def _deadletter_path() -> Path:
    # default: u-stock-bots/runtime/deadletter/supabase_events.jsonl
    base = (os.getenv("RUNNER_RUNTIME_DIR") or "").strip()
    if base:
        root = Path(base).expanduser().resolve()
    else:
        # runner/ -> u-stock-bots/
        root = Path(__file__).resolve().parents[1]
    p = root / "runtime" / "deadletter"
    p.mkdir(parents=True, exist_ok=True)
    return p / "supabase_events.jsonl"


def _write_deadletter(rows: List[Dict[str, Any]], error: str) -> None:
    if not rows:
        return
    path = _deadletter_path()
    rec = {
        "ts": _now_iso(),
        "error": error,
        "count": len(rows),
        "rows": rows,
    }
    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        # best-effort only
        pass


def _hash_event_id(parts: List[str]) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="ignore"))
        h.update(b"|")
    return h.hexdigest()


def _event_id_for_row(row: Dict[str, Any]) -> str:
    """
    Deterministic idempotency key.
    If the same order submission is retried, it creates the same event_id.
    """
    bot_id = str(row.get("bot_id") or "")
    mode = str(row.get("mode") or "")
    event_type = str(row.get("event_type") or "")
    symbol = str(row.get("symbol") or "")
    payload = row.get("payload") or {}

    # prefer stable identifiers inside payload if present
    order_id = str(payload.get("order_id") or payload.get("id") or "")
    intent = payload.get("intent") or {}
    entry = str(intent.get("entry") or "")
    stop = str(intent.get("stop") or "")
    tp = str(intent.get("take_profit") or "")

    return _hash_event_id([bot_id, mode, event_type, symbol, order_id, entry, stop, tp])


def _build_rows(bot_id: str, mode: str, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    b = str(bot_id or "").strip()
    if not b:
        return []

    m = _normalize_mode(mode)
    now_iso = _now_iso()

    rows: List[Dict[str, Any]] = []
    for evt in events:
        if not isinstance(evt, dict):
            continue
        if not _is_tx_event(evt):
            continue

        payload = evt.get("payload")
        if not isinstance(payload, dict):
            payload = {"raw": payload}

        symbol = evt.get("symbol")
        symbol = str(symbol).upper().strip() if symbol else None

        row = {
            "ts": evt.get("ts") or now_iso,
            "bot_id": b,
            "mode": m,
            "level": str(evt.get("level") or "info").strip().lower(),
            "event_type": str(evt.get("event_type") or "unknown").strip(),
            "symbol": symbol,
            "payload": payload,
        }

        # ✅ Idempotency key column (add this column in Supabase)
        row["event_id"] = evt.get("event_id") or _event_id_for_row(row)
        rows.append(row)

    return rows


def _post_rows(rows: List[Dict[str, Any]]) -> None:
    """
    Insert rows via PostgREST.
    Assumes table has UNIQUE(event_id) so duplicates are ignored/blocked.
    """
    if not rows:
        return
    if not sb_enabled():
        raise RuntimeError("Supabase not configured")

    supabase_url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/") + "/"
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    table = (os.getenv("SUPABASE_EVENTS_TABLE") or DEFAULT_TABLE).strip()
    timeout = int(os.getenv("SUPABASE_TIMEOUT", str(DEFAULT_TIMEOUT)))
    url = urljoin(supabase_url, f"rest/v1/{table}")

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
        # Let server ignore duplicates if you set unique constraint; otherwise it errors.
        # If you want explicit upsert semantics, you can add:
        # "Prefer": "resolution=ignore-duplicates,return=minimal"
    }

    r = requests.post(url, headers=headers, json=rows, timeout=timeout)
    if not (200 <= r.status_code < 300):
        body = (r.text or "")[:800]
        raise RuntimeError(f"Supabase insert failed {r.status_code}: {body}")


def upload_transaction_events(bot_id: str, mode: str, events: List[Dict[str, Any]]) -> None:
    """
    Upload ONLY transaction events (filtered). Batched. Retries. Dead-letter on failure.
    """
    if not events:
        return
    if not sb_enabled():
        return

    rows = _build_rows(bot_id, mode, events)
    if not rows:
        return

    batch_size = int(os.getenv("SUPABASE_BATCH_SIZE", str(DEFAULT_BATCH_SIZE)))
    max_attempts = int(os.getenv("SUPABASE_MAX_ATTEMPTS", "3"))
    base_backoff = float(os.getenv("SUPABASE_BACKOFF_SECONDS", "0.8"))

    for batch in _chunk(rows, batch_size):
        attempt = 0
        last_err = ""
        while True:
            attempt += 1
            try:
                _post_rows(batch)
                break
            except Exception as e:
                last_err = repr(e)
                if attempt >= max_attempts:
                    _write_deadletter(batch, last_err)
                    break
                time.sleep(base_backoff * (2 ** (attempt - 1)))
