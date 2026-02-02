# backend/api/core/bots/service.py
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional, Tuple

from api.core.bots.constants import HEARTBEAT_STALE_SECONDS, BOT_RUNNER_SECRET
from api.core.bots.validators import (
    iso_now,
    normalize_effective_state,
    normalize_intent,
    normalize_mode,
    parse_ts_to_epoch_seconds,
)
from api.core.bots.repo import BotRepo

from api.core.events.sink import get_event_sink
from api.core.events.models import BotEvent


_MAX_INTENTS_PER_SUBMIT = 50
_MAX_INTENTS_PREVIEW = 10
_MAX_REASON_CODES = 25
_MAX_REASON_LEN = 48
_MAX_SYMBOL_LEN = 16
_MAX_TIMEFRAME_LEN = 24
_MAX_BOT_ID_LEN = 64


def now_epoch() -> int:
    return int(time.time())


def default_config() -> Dict[str, Any]:
    return {"mode": "paper", "risk_per_trade": 0.005, "max_trades_per_day": 3, "min_confidence": 0.62}


def compute_offline(desired_state: str, last_heartbeat_epoch: int) -> Tuple[bool, Optional[int]]:
    now = now_epoch()
    if desired_state != "running":
        return False, None
    if not last_heartbeat_epoch:
        return True, None
    age = now - int(last_heartbeat_epoch)
    return age > HEARTBEAT_STALE_SECONDS, age


def require_runner(*, x_bot_runner_secret: Optional[str], x_runner_user_id: Optional[str]) -> str:
    if not BOT_RUNNER_SECRET:
        raise RuntimeError("Server not configured for runner auth (BOT_RUNNER_SECRET missing)")

    got = (x_bot_runner_secret or "").strip()
    if not got or got != BOT_RUNNER_SECRET:
        raise PermissionError("Runner not authenticated")

    uid = (x_runner_user_id or "").strip()
    if not uid:
        raise ValueError("Runner user_id missing (X-Runner-User-Id)")
    return uid


def _as_dict(x: Any) -> Dict[str, Any]:
    return x if isinstance(x, dict) else {}


def _as_list(x: Any) -> List[Any]:
    return x if isinstance(x, list) else []


def _clean_symbol(x: Any) -> str:
    s = str(x or "").strip().upper()
    if not s or len(s) > _MAX_SYMBOL_LEN:
        return ""
    for ch in s:
        if not (ch.isalnum() or ch in {".", "-"}):
            return ""
    return s


def _coerce_float(x: Any) -> Optional[float]:
    try:
        return float(x)
    except Exception:
        return None


def _trim_reason_codes(x: Any) -> List[str]:
    raw = _as_list(x)
    out: List[str] = []
    for v in raw[:_MAX_REASON_CODES]:
        s = str(v or "").strip()
        if not s:
            continue
        if len(s) > _MAX_REASON_LEN:
            s = s[:_MAX_REASON_LEN]
        out.append(s)
    return out


def _normalize_intent_item(raw: Any, *, bot_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None

    symbol = _clean_symbol(raw.get("symbol"))
    if not symbol:
        return None

    side = str(raw.get("side") or "").strip().lower()
    if side not in ("buy", "sell"):
        side = ""

    timeframe = str(raw.get("timeframe") or "").strip()
    if len(timeframe) > _MAX_TIMEFRAME_LEN:
        timeframe = timeframe[:_MAX_TIMEFRAME_LEN]

    out: Dict[str, Any] = {
        "bot_id": bot_id,
        "symbol": symbol,
        "side": side or None,
        "entry": _coerce_float(raw.get("entry")),
        "stop": _coerce_float(raw.get("stop")),
        "take_profit": _coerce_float(raw.get("take_profit")),
        "confidence": _coerce_float(raw.get("confidence")),
        "timeframe": timeframe or None,
        "reason_codes": _trim_reason_codes(raw.get("reason_codes")),
    }
    return {k: v for k, v in out.items() if v is not None}


def _stable_hash(obj: Any) -> str:
    try:
        return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    except Exception:
        return str(obj)


class BotService:
    def __init__(self, repo: BotRepo | None = None):
        self.repo = repo or BotRepo()
        self.sink = get_event_sink()

    def available(self) -> Dict[str, Any]:
        return {
            "bots": [
                {"id": "ema_trend", "name": "EMA Trend Bot", "description": "EMA reclaim + ATR gate + chop filter"},
            ]
        }

    def status(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        desired = self.repo.get_desired_state(user_id, bot_id)
        runtime = self.repo.get_runtime_state(user_id, bot_id)
        cfg = self.repo.get_config(user_id, bot_id, default_config())

        last_hb_epoch = parse_ts_to_epoch_seconds(runtime.get("last_heartbeat"))
        offline, age = compute_offline(desired, last_hb_epoch)

        effective = normalize_effective_state(runtime.get("runtime_state") or "stopped", default="stopped")
        if offline:
            effective = "offline"

        try:
            last_intents_count = int(runtime.get("last_intents_count") or 0)
        except Exception:
            last_intents_count = 0

        last_intents_at = parse_ts_to_epoch_seconds(runtime.get("last_intents_at"))
        last_intents_preview = runtime.get("last_intents_preview")
        if not isinstance(last_intents_preview, list):
            last_intents_preview = []

        return {
            "bot_id": bot_id,
            "intent": "running" if desired == "running" else "paused",
            "effective_state": effective,
            "reason_code": None,
            "message": None,
            "heartbeatAt": last_hb_epoch,
            "heartbeatAgeSec": age,
            "lastRun": parse_ts_to_epoch_seconds(runtime.get("last_started_at")),
            "lastTick": last_hb_epoch,
            "mode": str((cfg.get("mode") if isinstance(cfg, dict) else None) or "paper"),
            "nextOpenEpoch": None,
            "pausedReason": None if desired == "running" else "manual_pause",
            "lastError": runtime.get("last_error_message"),
            "lastIntents": last_intents_count,
            "lastIntentsAt": last_intents_at,
            "lastIntentsPreview": last_intents_preview[:_MAX_INTENTS_PREVIEW],
            "config": cfg if isinstance(cfg, dict) else default_config(),
        }

    def start(self, user_id: str, bot_id: str, mode: str) -> Dict[str, Any]:
        cfg = self.repo.get_config(user_id, bot_id, default_config())
        if not isinstance(cfg, dict):
            cfg = default_config()
        cfg["mode"] = mode
        self.repo.set_config(user_id, bot_id, cfg)

        self.repo.set_desired_state(user_id, bot_id, "running")
        self.repo.insert_log(user_id, bot_id, "info", "Intent set: running", {"mode": mode})

        self.repo.upsert_runtime_state(
            user_id,
            bot_id,
            {"runtime_state": "starting", "last_started_at": iso_now(), "last_error_type": None, "last_error_message": None},
        )

        self.sink.emit(BotEvent(bot_id=bot_id, event_type="bot_started", user_id=user_id, data={"mode": mode, "source": "api"}))

        return {"ok": True, "bot_id": bot_id, "intent": "running", "effective_state": "starting", "mode": mode}

    def stop(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        self.repo.set_desired_state(user_id, bot_id, "paused")
        self.repo.insert_log(user_id, bot_id, "info", "Intent set: paused", {"paused_reason": "manual_pause"})

        self.repo.upsert_runtime_state(
            user_id,
            bot_id,
            {"runtime_state": "paused", "last_stopped_at": iso_now(), "last_error_type": None, "last_error_message": None},
        )

        self.sink.emit(BotEvent(bot_id=bot_id, event_type="bot_paused", user_id=user_id, data={"source": "api", "paused_reason": "manual_pause"}))

        return {"ok": True, "bot_id": bot_id, "intent": "paused", "effective_state": "paused"}

    # ✅ UPDATED: server-side timeframe filtering
    def get_log(self, user_id: str, bot_id: str, limit: int, start_ts: int = 0, end_ts: int = 0) -> Dict[str, Any]:
        """
        Reads logs and returns newest `limit` rows that fall within [start_ts, end_ts] (inclusive),
        when provided.

        Safe strategy:
          - fetch up to 300 rows from repo (max)
          - convert to epoch seconds
          - filter
          - return newest `limit` in chronological order
        """
        eff_limit = max(1, min(300, int(limit or 50)))
        lo = int(start_ts or 0)
        hi = int(end_ts or 0)

        # fetch a generous window so filtering doesn't return empty by accident
        fetch_n = 300 if (lo or hi) else eff_limit
        rows = self.repo.get_logs(user_id, bot_id, limit=int(fetch_n))

        normalized: List[Dict[str, Any]] = []
        for r in rows:
            ts = parse_ts_to_epoch_seconds(r.get("ts"))
            normalized.append(
                {
                    "ts": ts,
                    "level": r.get("level"),
                    "message": r.get("message"),
                    "meta": r.get("meta") or {},
                }
            )

        # repo returns newest-first in most setups; your prior code reversed for UI.
        # We'll treat it as newest-first, but normalize into chronological at end.
        filtered = []
        for it in normalized:
            ts = int(it.get("ts") or 0)
            if lo and ts and ts < lo:
                continue
            if hi and ts and ts > hi:
                continue
            filtered.append(it)

        # keep newest N in range
        newest_first = filtered[:]
        newest_first.sort(key=lambda x: int(x.get("ts") or 0), reverse=True)
        newest_first = newest_first[:eff_limit]

        # return chronological like before
        newest_first.sort(key=lambda x: int(x.get("ts") or 0))
        return {
            "bot_id": bot_id,
            "items": newest_first,
            "meta": {"start_ts": lo or None, "end_ts": hi or None, "returned": len(newest_first)},
        }

    def set_config(self, user_id: str, bot_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        existing = self.repo.get_config(user_id, bot_id, default_config())
        merged = dict(existing if isinstance(existing, dict) else default_config())
        merged.update(config)

        merged["mode"] = normalize_mode(merged.get("mode"))
        try:
            merged["risk_per_trade"] = float(merged.get("risk_per_trade", 0.005))
        except Exception:
            merged["risk_per_trade"] = 0.005
        try:
            merged["max_trades_per_day"] = max(1, int(merged.get("max_trades_per_day", 3)))
        except Exception:
            merged["max_trades_per_day"] = 3
        try:
            mc = float(merged.get("min_confidence", 0.62))
            merged["min_confidence"] = float(min(0.99, max(0.0, mc)))
        except Exception:
            merged["min_confidence"] = 0.62

        self.repo.set_config(user_id, bot_id, merged)
        self.repo.insert_log(user_id, bot_id, "info", "Config updated", {"config": merged})

        self.sink.emit(BotEvent(bot_id=bot_id, event_type="signal_generated", user_id=user_id, data={"source": "api", "action": "config_updated"}))

        return {"ok": True, "bot_id": bot_id, "config": merged}

    def get_config(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        cfg = self.repo.get_config(user_id, bot_id, default_config())
        return {"bot_id": bot_id, "config": cfg if isinstance(cfg, dict) else default_config()}

    def submit_intents(self, user_id: str, bot_id: str, ts: int, intents: List[Dict[str, Any]]) -> Dict[str, Any]:
        bid = str(bot_id or "").strip()[:_MAX_BOT_ID_LEN]
        if not bid:
            return {"ok": False, "error": "bot_id required"}

        raw_items = _as_list(intents)
        trimmed = raw_items[:_MAX_INTENTS_PER_SUBMIT]

        normalized: List[Dict[str, Any]] = []
        for it in trimmed:
            clean = _normalize_intent_item(it, bot_id=bid)
            if clean:
                normalized.append(clean)

        prev = self.repo.get_runtime_state(user_id, bid)
        prev_sig = str(prev.get("last_intents_sig") or "")
        sig = _stable_hash(normalized[:_MAX_INTENTS_PREVIEW])

        patch: Dict[str, Any] = {
            "last_intents_count": len(normalized),
            "last_intents_at": iso_now(),
            "last_intents_preview": normalized[:_MAX_INTENTS_PREVIEW],
            "last_intents_sig": sig,
        }

        try:
            self.repo.upsert_runtime_state(user_id, bid, patch)
        except Exception as e:
            return {"ok": False, "bot_id": bid, "error": f"persist_failed: {type(e).__name__}"}

        if sig and sig != prev_sig:
            try:
                self.repo.insert_log(user_id, bid, "info", "Strategy intents submitted", {"count": len(normalized)})
            except Exception:
                pass

        try:
            self.sink.emit(
                BotEvent(
                    bot_id=bid,
                    event_type="intents_submitted",
                    user_id=user_id,
                    data={"count": len(normalized), "ts": int(ts or now_epoch()), "source": "runner"},
                )
            )
        except Exception:
            pass

        return {"ok": True, "bot_id": bid, "stored": len(normalized), "ts": int(ts or now_epoch())}

    def heartbeat(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        bot_id = str(payload.get("bot_id") or "").strip()
        intent_in = normalize_intent(payload.get("intent"), default="running")
        eff_in = normalize_effective_state(payload.get("effective_state"), default="running")
        mode = normalize_mode(payload.get("mode"))

        reason_code = str(payload.get("reason_code") or "").strip() or None
        message = str(payload.get("message") or "").strip() or None
        last_error = str(payload.get("last_error") or "").strip() or None

        prev = self.repo.get_runtime_state(user_id, bot_id)
        prev_state = str(prev.get("runtime_state") or "").strip().lower() or None
        prev_err = str(prev.get("last_error_message") or "").strip() or None

        patch: Dict[str, Any] = {
            "runtime_state": eff_in,
            "last_heartbeat": iso_now(),
            "runner_id": payload.get("runner_id") or prev.get("runner_id"),
            "last_error_type": ("runner_exception" if last_error else None),
            "last_error_message": (last_error if last_error else None),
        }

        if eff_in in ("starting", "running", "waiting_for_market"):
            patch["last_started_at"] = prev.get("last_started_at") or iso_now()
        if eff_in in ("paused", "stopped"):
            patch["last_stopped_at"] = iso_now()

        self.repo.upsert_runtime_state(user_id, bot_id, patch)

        if last_error and last_error != prev_err:
            self.repo.insert_log(user_id, bot_id, "error", "Runner error", {"error": last_error, "reason_code": reason_code})
            self.sink.emit(BotEvent(bot_id=bot_id, event_type="bot_error", user_id=user_id, data={"error": last_error, "reason_code": reason_code}))
        elif prev_state and prev_state != eff_in:
            self.repo.insert_log(
                user_id,
                bot_id,
                "info",
                "State changed",
                {"from": prev_state, "to": eff_in, "intent": intent_in, "mode": mode, "reason_code": reason_code, "message": message},
            )
            et = "heartbeat"
            if eff_in == "running":
                et = "bot_resumed"
            elif eff_in in ("paused", "stopped"):
                et = "bot_paused"
            self.sink.emit(BotEvent(bot_id=bot_id, event_type=et, user_id=user_id, data={"from": prev_state, "to": eff_in, "intent": intent_in, "mode": mode}))

        return {"ok": True, "bot_id": bot_id, "intent": intent_in, "effective_state": eff_in, "ts": now_epoch()}
