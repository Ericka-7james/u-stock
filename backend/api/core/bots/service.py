from __future__ import annotations

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
            "lastIntents": 0,
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

    def get_log(self, user_id: str, bot_id: str, limit: int) -> Dict[str, Any]:
        rows = self.repo.get_logs(user_id, bot_id, limit=limit)
        items: List[Dict[str, Any]] = []
        for r in rows:
            items.append(
                {
                    "ts": parse_ts_to_epoch_seconds(r.get("ts")),
                    "level": r.get("level"),
                    "message": r.get("message"),
                    "meta": r.get("meta") or {},
                }
            )
        items = list(reversed(items))
        return {"bot_id": bot_id, "items": items}

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
            # Map some state changes to events
            et = "heartbeat"
            if eff_in == "running":
                et = "bot_resumed"
            elif eff_in in ("paused", "stopped"):
                et = "bot_paused"
            self.sink.emit(BotEvent(bot_id=bot_id, event_type=et, user_id=user_id, data={"from": prev_state, "to": eff_in, "intent": intent_in, "mode": mode}))

        return {"ok": True, "bot_id": bot_id, "intent": intent_in, "effective_state": eff_in, "ts": now_epoch()}
