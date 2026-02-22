# u-stock-bots/runner/supabase.py
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urljoin

import requests

# --------------------------------------------
# What we store
# --------------------------------------------
TRANSACTION_EVENT_TYPES = {
    "order_submitted",
    "order_filled",
    "order_partially_filled",
    "order_canceled",
    "order_rejected",
    "order_failed",
    "trade_closed",
    # optional: if you want to store the risk gate event in bot_events, keep it here
    "risk_gate_block",
}

DEFAULT_TABLE = "bot_events"
DEFAULT_BATCH_SIZE = 100
DEFAULT_TIMEOUT = 8


# --------------------------------------------
# Env helpers
# --------------------------------------------
def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name, "")
    if raw == "":
        return int(default)
    try:
        return int(raw)
    except Exception:
        return int(default)


def _env_float(name: str, default: float) -> float:
    raw = _env(name, "")
    if raw == "":
        return float(default)
    try:
        return float(raw)
    except Exception:
        return float(default)


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name, "")
    if raw == "":
        return bool(default)
    return raw.lower() in {"1", "true", "t", "yes", "y", "on"}


def sb_enabled() -> bool:
    """
    Supabase upload is an optional sink.
    We keep it fail-soft and configurable.
    """
    if not _env_bool("SUPABASE_EVENTS_ENABLED", True):
        return False
    return bool(_env("SUPABASE_URL") and _env("SUPABASE_SERVICE_ROLE_KEY"))


# --------------------------------------------
# Normalizers
# --------------------------------------------
def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _is_tx_event(evt: Dict[str, Any]) -> bool:
    return str(evt.get("event_type") or "").strip() in TRANSACTION_EVENT_TYPES


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _mask(s: str) -> str:
    s = str(s or "")
    if not s:
        return ""
    if len(s) <= 4:
        return "****"
    return s[:2] + "****" + s[-2:]


# --------------------------------------------
# Deadletter (local durability)
# --------------------------------------------
def _deadletter_path() -> Path:
    base = _env("RUNNER_RUNTIME_DIR", "")
    if base:
        root = Path(base).expanduser().resolve()
    else:
        # .../u-stock-bots/runner/supabase.py -> .../u-stock-bots
        root = Path(__file__).resolve().parents[1]

    p = root / "runtime" / "deadletter"
    p.mkdir(parents=True, exist_ok=True)
    return p / "supabase_events.jsonl"


def _write_deadletter(rows: List[Dict[str, Any]], error: str) -> None:
    """
    Keep deadletters small and safe. Store only a slim preview and counts.
    """
    if not rows:
        return

    path = _deadletter_path()

    slim_rows: List[Dict[str, Any]] = []
    for r in rows:
        payload = r.get("payload") if isinstance(r.get("payload"), dict) else {}
        slim_rows.append(
            {
                "ts": r.get("ts"),
                "user_id": r.get("user_id"),
                "bot_id": r.get("bot_id"),
                "mode": r.get("mode"),
                "event_type": r.get("event_type"),
                "symbol": r.get("symbol"),
                "event_id": r.get("event_id"),
                "order_id": str(payload.get("order_id") or payload.get("id") or "") or None,
            }
        )

    rec = {
        "ts": _now_iso(),
        "error": error,
        "count": len(rows),
        "rows": slim_rows,
    }

    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        # deadletter is best-effort; never crash runner
        return


# --------------------------------------------
# Event id (idempotency support)
# --------------------------------------------
def _hash_event_id(parts: List[str]) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="ignore"))
        h.update(b"|")
    return h.hexdigest()


def _event_id_for_row(row: Dict[str, Any]) -> str:
    bot_id = str(row.get("bot_id") or "")
    mode = str(row.get("mode") or "")
    event_type = str(row.get("event_type") or "")
    symbol = str(row.get("symbol") or "")
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}

    order_id = str(payload.get("order_id") or payload.get("id") or "")
    intent = payload.get("intent") if isinstance(payload.get("intent"), dict) else {}
    entry = str(intent.get("entry") or "")
    stop = str(intent.get("stop") or "")
    tp = str(intent.get("take_profit") or "")

    return _hash_event_id([bot_id, mode, event_type, symbol, order_id, entry, stop, tp])


# --------------------------------------------
# Row builder
# --------------------------------------------
def _build_rows(user_id: str, bot_id: str, mode: str, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    u = str(user_id or "").strip()
    b = str(bot_id or "").strip()
    if not u or not b:
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

        row: Dict[str, Any] = {
            "ts": evt.get("ts") or now_iso,
            "user_id": u,
            "bot_id": b,
            "mode": m,
            "level": str(evt.get("level") or "info").strip().lower(),
            "event_type": str(evt.get("event_type") or "unknown").strip(),
            "symbol": symbol,
            "payload": payload,
        }

        # Prefer explicit event_id (decision scoped) if provided.
        row["event_id"] = evt.get("event_id") or _event_id_for_row(row)
        rows.append(row)

    return rows


# --------------------------------------------
# HTTP post
# --------------------------------------------
_TABLE_RE = re.compile(r"^[a-zA-Z0-9_]+$")


def _supabase_table_name() -> str:
    table = _env("SUPABASE_EVENTS_TABLE", DEFAULT_TABLE) or DEFAULT_TABLE
    table = table.strip()
    # Safety: avoid weird strings making it into the URL path
    if not _TABLE_RE.match(table):
        return DEFAULT_TABLE
    return table


def _supabase_headers(service_role_key: str) -> Dict[str, str]:
    # NOTE: service role is powerful. In production, keep it server-side or locked down
    # to the runner host. This module assumes runner is trusted infra.
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        # If you add a UNIQUE constraint later, this helps idempotency.
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    }


def _post_rows(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    if not sb_enabled():
        raise RuntimeError("Supabase not configured")

    supabase_url = _env("SUPABASE_URL").rstrip("/") + "/"
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    table = _supabase_table_name()
    timeout = _env_int("SUPABASE_TIMEOUT", DEFAULT_TIMEOUT)

    url = urljoin(supabase_url, f"rest/v1/{table}")
    headers = _supabase_headers(key)

    r = requests.post(url, headers=headers, json=rows, timeout=timeout)

    if 200 <= r.status_code < 300:
        return

    body = (r.text or "")[:800]
    raise RuntimeError(f"Supabase insert failed {r.status_code}: {body}")


def _chunk_iter(xs: List[Any], size: int) -> Iterable[List[Any]]:
    if size <= 0:
        size = DEFAULT_BATCH_SIZE
    for i in range(0, len(xs), size):
        yield xs[i : i + size]


# --------------------------------------------
# Public API
# --------------------------------------------
def upload_transaction_events(user_id: str, bot_id: str, mode: str, events: List[Dict[str, Any]]) -> None:
    """
    Upload ONLY transaction-like events.

    Fail-soft rules:
      - If Supabase is not enabled: no-op
      - If a batch fails after retries: deadletter and continue
      - Never raise to caller (runner loop safety)
    """
    if not events or not sb_enabled():
        return

    rows = _build_rows(user_id, bot_id, mode, events)
    if not rows:
        return

    batch_size = _env_int("SUPABASE_BATCH_SIZE", DEFAULT_BATCH_SIZE)
    max_attempts = _env_int("SUPABASE_MAX_ATTEMPTS", 3)
    base_backoff = _env_float("SUPABASE_BACKOFF_SECONDS", 0.8)
    jitter = _env_float("SUPABASE_BACKOFF_JITTER", 0.15)
    debug = _env_bool("RUNNER_DEBUG", False)

    for batch in _chunk_iter(rows, batch_size):
        attempt = 0
        last_err = ""

        while True:
            attempt += 1
            try:
                _post_rows(batch)
                break
            except Exception as e:
                last_err = repr(e)

                if debug:
                    print(
                        "[runner] supabase upload failed:",
                        f"attempt={attempt}/{max_attempts}",
                        f"rows={len(batch)}",
                        f"err={last_err}",
                        f"url={_env('SUPABASE_URL')}",
                        f"key={_mask(_env('SUPABASE_SERVICE_ROLE_KEY'))}",
                    )

                if attempt >= max_attempts:
                    _write_deadletter(batch, last_err)
                    break

                # exponential backoff + tiny jitter so multiple runners don't thump together
                sleep_s = base_backoff * (2 ** (attempt - 1))
                sleep_s = max(0.1, float(sleep_s))
                sleep_s = sleep_s * (1.0 + random.uniform(-jitter, jitter))
                time.sleep(max(0.05, sleep_s))