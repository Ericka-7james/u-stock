# backend/api/core/bots/service.py
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from api.db import get_supabase_service
from api.core.bots.validators import parse_ts_to_epoch_seconds, normalize_mode


# -------------------------
# Helpers
# -------------------------
def _now_epoch() -> int:
    return int(time.time())


def _epoch_to_iso_z(ep: int) -> str:
    import time as _t
    return _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime(int(ep)))


def _safe_sb_execute(fn, *, default: Any):
    """
    Fail-soft wrapper: don't take down the API if Supabase errors.
    IMPORTANT: For production, prefer logging exceptions server-side.
    """
    try:
        return fn()
    except Exception:
        return default


def _heartbeat_age_or_none(last_heartbeat_at: Any) -> Optional[int]:
    ep = parse_ts_to_epoch_seconds(last_heartbeat_at) or 0
    if ep <= 0:
        return None
    return max(0, _now_epoch() - int(ep))


def _compute_desired_state(*, armed: bool, intent: str) -> str:
    it = str(intent or "").strip().lower()
    if it == "running":
        return "running"
    if armed:
        return "armed"
    return "paused"


def _compute_effective_state(*, row_eff: str, intent: str, hb_age_sec: Optional[int]) -> str:
    eff = str(row_eff or "").strip().lower()
    it = str(intent or "").strip().lower()

    # No heartbeat yet
    if hb_age_sec is None:
        if it == "running":
            return "starting"
        return "paused"

    # Stale heartbeat -> offline
    if hb_age_sec > 90:
        return "offline"

    # Prefer runner-reported state if present
    if eff:
        return eff

    # Fallback
    if it == "running":
        return "running"
    if it == "paused":
        return "paused"
    return "stopped"


class BotService:
    def __init__(self) -> None:
        self.sb = get_supabase_service()

    # -------------------------
    # Catalog
    # -------------------------
    def available(self) -> Dict[str, Any]:
        bots = [
            {"id": "ema_trend", "name": "EMA Trend Bot", "description": "Trend-following EMA signals + risk gates."},
            {"id": "orb", "name": "ORB Bot", "description": "Opening Range Breakout scanner + execution."},
            {"id": "mean_revert", "name": "Mean Revert Bot", "description": "Mean reversion entries with confidence gating."},
        ]
        return {"ok": True, "bots": bots}

    # -------------------------
    # Config
    # -------------------------
    def get_config(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        def _read():
            res = (
                self.sb.table("bot_configs")
                .select("config,updated_at")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            data = getattr(res, "data", None) or {}
            cfg = data.get("config")
            if not isinstance(cfg, dict):
                cfg = {}
            return {"ok": True, "bot_id": bid, "config": cfg}

        # default ok=True so UI doesn't break if configs table missing / RLS blocks
        return _safe_sb_execute(_read, default={"ok": True, "bot_id": bid, "config": {}})

    def set_config(self, user_id: str, bot_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        cfg = config if isinstance(config, dict) else {}

        def _write():
            self.sb.table("bot_configs").upsert(
                {"user_id": uid, "bot_id": bid, "config": cfg, "updated_at": _epoch_to_iso_z(_now_epoch())},
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "config": cfg}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "config": cfg})

    # -------------------------
    # Status / control
    # -------------------------
    def status(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        base: Dict[str, Any] = {
            "ok": True,
            "user_id": uid,
            "bot_id": bid,

            # canonical
            "intent": "paused",
            "mode": "paper",
            "armed": False,
            "config": {},

            # UI contract
            "effective_state": "paused",
            "desired_state": "paused",
            "message": "",
            "pausedReason": "",
            "lastError": "",
            "heartbeatAgeSec": None,  # null means “no heartbeat yet”
            "nextOpenEpoch": 0,
            "lastTickEpoch": 0,

            # intents snapshot fields
            "lastIntents": 0,
            "lastIntentsAt": 0,
            "lastIntentsPreview": [],
        }

        def _latest_hb_age_from_events() -> Optional[int]:
            """
            Fallback when bot_state table/columns aren't present or aren't being updated yet.
            We KNOW heartbeats are inserted into bot_events, so use that as the source of truth.
            """
            try:
                res = (
                    self.sb.table("bot_events")
                    .select("ts")
                    .eq("user_id", uid)
                    .eq("bot_id", bid)
                    .eq("event_type", "heartbeat")
                    .order("ts", desc=True)
                    .limit(1)
                    .execute()
                )
                rows = getattr(res, "data", None) or []
                if not isinstance(rows, list) or not rows:
                    return None
                ts = rows[0].get("ts")
                return _heartbeat_age_or_none(ts)
            except Exception:
                return None

        def _read():
            out = dict(base)

            # attach config (safe)
            cfg = self.get_config(uid, bid).get("config") or {}
            out["config"] = cfg if isinstance(cfg, dict) else {}

            # Try bot_state first (newer schema)
            row: Dict[str, Any] = {}
            try:
                res = (
                    self.sb.table("bot_state")
                    .select("*")
                    .eq("user_id", uid)
                    .eq("bot_id", bid)
                    .maybe_single()
                    .execute()
                )
                row = getattr(res, "data", None) or {}
                if not isinstance(row, dict):
                    row = {}
            except Exception:
                row = {}

            # If bot_state missing/empty, still compute heartbeat from bot_events
            if not row:
                hb_age = _latest_hb_age_from_events()
                out["heartbeatAgeSec"] = hb_age
                out["desired_state"] = _compute_desired_state(armed=False, intent=out["intent"])
                out["effective_state"] = _compute_effective_state(row_eff="", intent=out["intent"], hb_age_sec=hb_age)
                return out

            intent = str(row.get("intent") or out["intent"]).strip().lower()
            mode = normalize_mode(row.get("mode") or out["mode"])
            armed = bool(row.get("armed") or False)

            hb_age = _heartbeat_age_or_none(row.get("last_heartbeat_at"))
            if hb_age is None:
                hb_age = _latest_hb_age_from_events()

            desired = (
                str(row.get("desired_state") or "").strip().lower()
                or _compute_desired_state(armed=armed, intent=intent)
            )

            eff = _compute_effective_state(
                row_eff=str(row.get("effective_state") or ""),
                intent=intent,
                hb_age_sec=hb_age,
            )

            out["intent"] = intent
            out["mode"] = mode
            out["armed"] = armed

            out["heartbeatAgeSec"] = hb_age
            out["desired_state"] = desired
            out["effective_state"] = eff

            out["message"] = str(row.get("message") or "").strip()
            out["pausedReason"] = str(row.get("paused_reason") or "").strip()
            out["lastError"] = str(row.get("last_error") or "").strip()

            out["lastIntents"] = int(row.get("last_intents_count") or 0)
            out["lastIntentsAt"] = int(parse_ts_to_epoch_seconds(row.get("last_intents_at")) or 0)
            preview = row.get("last_intents_preview") or []
            out["lastIntentsPreview"] = preview if isinstance(preview, list) else []

            # Persisted by heartbeat() when runner passes it
            try:
                out["lastTickEpoch"] = int(row.get("last_tick_epoch") or 0)
            except Exception:
                out["lastTickEpoch"] = 0

            # Persisted by heartbeat() when runner is waiting_for_market
            try:
                out["nextOpenEpoch"] = int(row.get("next_open_epoch") or 0)
            except Exception:
                out["nextOpenEpoch"] = 0

            return out

        return _safe_sb_execute(_read, default=base)

    def arm(self, user_id: str, bot_id: str, mode: Optional[str]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        m = normalize_mode(mode) if mode else None

        def _write():
            patch: Dict[str, Any] = {
                "user_id": uid,
                "bot_id": bid,
                "armed": True,
                "desired_state": "armed",
                "updated_at": _epoch_to_iso_z(_now_epoch()),
            }
            if m:
                patch["mode"] = m
            self.sb.table("bot_state").upsert(patch, on_conflict="user_id,bot_id").execute()
            return {"ok": True, "bot_id": bid, "armed": True, "mode": m or "paper"}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "armed": True, "mode": m or "paper"})

    def disarm(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        def _write():
            self.sb.table("bot_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "armed": False,
                    "intent": "paused",
                    "desired_state": "paused",
                    "updated_at": _epoch_to_iso_z(_now_epoch()),
                },
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "armed": False}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "armed": False})

    def start(self, user_id: str, bot_id: str, mode: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        m = normalize_mode(mode)

        def _write():
            self.sb.table("bot_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "intent": "running",
                    "desired_state": "running",
                    "mode": m,
                    "updated_at": _epoch_to_iso_z(_now_epoch()),
                },
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "intent": "running", "mode": m}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "intent": "running", "mode": m})

    def stop(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        def _write():
            # do NOT overwrite desired_state here (keeps “armed” if they only pause)
            self.sb.table("bot_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "intent": "paused",
                    "updated_at": _epoch_to_iso_z(_now_epoch()),
                },
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "intent": "paused"}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "intent": "paused"})

    # -------------------------
    # Runner endpoints
    # -------------------------
    def heartbeat(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Writes:
        - bot_events: heartbeat event (for logs)
        - bot_state: last_heartbeat_at + state fields

        Breakpoints:
        - table/column mismatch (next_open_epoch missing, etc.)
        - payload missing bot_id/user_id due to runner bug
        """
        uid = str(user_id or "").strip()
        bid = str(payload.get("bot_id") or "").strip()
        mode = normalize_mode(payload.get("mode") or "paper")

        intent = str(payload.get("intent") or "").strip().lower()
        eff = str(payload.get("effective_state") or "").strip().lower()
        message = str(payload.get("message") or "").strip()

        paused_reason = str(payload.get("paused_reason") or "").strip()
        last_error = str(payload.get("last_error") or "").strip()

        # runner heartbeat can include these
        next_open_epoch = payload.get("next_open_epoch")
        last_tick = payload.get("last_tick")

        try:
            last_tick_epoch = int(last_tick) if last_tick is not None else 0
        except Exception:
            last_tick_epoch = 0

        try:
            next_open_epoch_int = int(next_open_epoch) if next_open_epoch is not None else 0
        except Exception:
            next_open_epoch_int = 0

        def _write():
            now_iso = _epoch_to_iso_z(_now_epoch())

            # 1) append to bot_events (this powers “Logs” UI)
            self.sb.table("bot_events").insert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "mode": mode,
                    "ts": now_iso,
                    "level": "info",
                    "event_type": "heartbeat",
                    "symbol": None,
                    "event_id": payload.get("event_id"),
                    "payload": payload,
                }
            ).execute()

            # 2) update bot_state summary fields (if bot_state exists)
            patch: Dict[str, Any] = {
                "user_id": uid,
                "bot_id": bid,
                "mode": mode,
                "last_heartbeat_at": now_iso,
                "updated_at": now_iso,
            }

            if intent:
                patch["intent"] = intent
            if eff:
                patch["effective_state"] = eff
            if message:
                patch["message"] = message
            if paused_reason:
                patch["paused_reason"] = paused_reason
            if last_error:
                patch["last_error"] = last_error
            if last_tick_epoch:
                patch["last_tick_epoch"] = last_tick_epoch
            if next_open_epoch_int:
                patch["next_open_epoch"] = next_open_epoch_int

            self.sb.table("bot_state").upsert(patch, on_conflict="user_id,bot_id").execute()
            return {"ok": True}

        return _safe_sb_execute(_write, default={"ok": True})

    def submit_intents(self, user_id: str, bot_id: str, ts: int, items: List[Any]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        preview: List[Dict[str, Any]] = []
        for x in items[:5]:
            preview.append(x if isinstance(x, dict) else {"raw": x})

        def _write():
            self.sb.table("bot_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "last_intents_at": _epoch_to_iso_z(int(ts or _now_epoch())),
                    "last_intents_count": int(len(items)),
                    "last_intents_preview": preview,
                    "updated_at": _epoch_to_iso_z(_now_epoch()),
                },
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "count": int(len(items)), "ts": int(ts or 0)}

        return _safe_sb_execute(_write, default={"ok": True, "count": int(len(items)), "ts": int(ts or 0)})

    def get_log(
        self,
        user_id: str,
        bot_id: str,
        *,
        mode: str,
        limit: int,
        start_ts: int,
        end_ts: int,
    ) -> Dict[str, Any]:
        """
        Returns bot_events rows filtered by mode.

        NOTE:
        - UI passes start_ts/end_ts in epoch seconds.
        - We store ts in ISO Z (UTC) in bot_events.
        """
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        m = normalize_mode(mode)

        def _read():
            q = (
                self.sb.table("bot_events")
                .select("ts,level,event_type,symbol,payload,event_id")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .eq("mode", m)  # ✅ critical
                .order("ts", desc=True)
                .limit(int(limit))
            )

            if int(end_ts or 0) > 0:
                q = q.lt("ts", _epoch_to_iso_z(int(end_ts) + 1))
            if int(start_ts or 0) > 0:
                q = q.gte("ts", _epoch_to_iso_z(int(start_ts)))

            res = q.execute()
            rows = getattr(res, "data", None) or []
            if not isinstance(rows, list):
                rows = []

            items: List[Dict[str, Any]] = []
            for r in rows:
                if not isinstance(r, dict):
                    continue

                payload = r.get("payload")
                if not isinstance(payload, dict):
                    payload = {"raw": payload}

                items.append(
                    {
                        "ts": parse_ts_to_epoch_seconds(r.get("ts")),
                        "level": str(r.get("level") or "info").strip().lower(),
                        "event_type": str(r.get("event_type") or "").strip(),
                        "symbol": (str(r.get("symbol") or "").strip().upper() or None),
                        "event_id": str(r.get("event_id") or "").strip() or None,
                        "payload": payload,
                    }
                )

            return {"ok": True, "bot_id": bid, "mode": m, "items": items}

        return _safe_sb_execute(_read, default={"ok": True, "bot_id": bid, "mode": m, "items": []})


"""
TODOs (production hardening):
- Add server-side logging inside _safe_sb_execute so supabase failures are visible.
- Consider batching bot_events inserts (or sampling) if heartbeat frequency rises.
- Consider a DB function / RPC for heartbeat to do event insert + state upsert atomically.
"""
