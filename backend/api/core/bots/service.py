# backend/api/core/bots/service.py
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from api.core.bots.validators import normalize_mode, parse_ts_to_epoch_seconds
from api.db import get_supabase_service


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


def _normalize_legacy_intent(it: Any) -> str:
    """
    Backwards-compat: older values may still contain 'paused'.
    Canonical lifecycle intents are: running | stopped.
    """
    v = str(it or "").strip().lower()
    if v == "paused":
        return "stopped"
    if v == "armed":
        return "stopped"
    return v


def _compute_effective_state(*, runtime_state: Any, desired_state: Any, hb_age_sec: Optional[int]) -> str:
    eff = str(runtime_state or "").strip().lower()
    desired = _normalize_legacy_intent(desired_state)

    if eff == "paused":
        eff = "stopped"

    if hb_age_sec is None:
        if desired == "running":
            return "starting"
        if eff:
            return eff
        return "stopped"

    if hb_age_sec > 360:
        return "offline"

    if eff:
        return eff

    if desired == "running":
        return "running"
    return "stopped"


# -------------------------
# Heartbeat log throttling (per-type)
# -------------------------
HB_5_MIN = 5 * 60
HB_15_MIN = 15 * 60
HB_30_MIN = 30 * 60
HB_1_HOUR = 60 * 60


def _hb_signature(payload: Dict[str, Any]) -> str:
    """
    Stable signature so we can avoid spamming bot_events when nothing changes.
    """
    if not isinstance(payload, dict):
        payload = {}

    desired_state = _normalize_legacy_intent(payload.get("desired_state") or payload.get("intent"))
    eff = str(payload.get("effective_state") or "").strip().lower()
    if eff == "paused":
        eff = "stopped"

    mode = normalize_mode(payload.get("mode") or "paper")

    msg = str(payload.get("message") or "").strip()
    paused_reason = str(payload.get("paused_reason") or "").strip()
    last_error = str(payload.get("last_error") or "").strip()
    reason_code = str(payload.get("reason_code") or "").strip()

    try:
        next_open_epoch = int(payload.get("next_open_epoch") or 0)
    except Exception:
        next_open_epoch = 0

    return "|".join(
        [
            f"desired={desired_state}",
            f"eff={eff}",
            f"mode={mode}",
            f"reason={reason_code}",
            f"next_open={next_open_epoch}",
            f"msg={msg}",
            f"paused={paused_reason}",
            f"err={last_error}",
        ]
    )


def _is_blocked_no_valid_intents(payload: Dict[str, Any]) -> bool:
    """
    Detect noisy case: 'blocked: no valid intents'
    We check message + paused_reason + reason_code to be robust.
    """
    if not isinstance(payload, dict):
        return False
    msg = str(payload.get("message") or "").strip().lower()
    pr = str(payload.get("paused_reason") or "").strip().lower()
    rc = str(payload.get("reason_code") or "").strip().lower()

    blob = " ".join([msg, pr, rc]).strip()
    if "no valid intents" in blob:
        return True
    if "no_valid_intents" in blob:
        return True
    if rc.startswith("blocked") and ("intent" in blob or "valid" in blob):
        return True
    return False


def _heartbeat_throttle_seconds(payload: Dict[str, Any]) -> int:
    """
    Per-type throttle policy for inserting heartbeat into bot_events.
    Signature changes ALWAYS log immediately; this only applies when signature is unchanged.
    """
    if not isinstance(payload, dict):
        return HB_1_HOUR

    eff = str(payload.get("effective_state") or "").strip().lower()
    if eff == "paused":
        eff = "stopped"

    desired_state = _normalize_legacy_intent(payload.get("desired_state") or payload.get("intent"))
    reason_code = str(payload.get("reason_code") or "").strip().lower()
    last_error = str(payload.get("last_error") or "").strip()

    if _is_blocked_no_valid_intents(payload):
        return HB_1_HOUR

    if eff == "waiting_for_market" or reason_code == "market_closed":
        return HB_30_MIN

    if eff == "starting":
        return HB_5_MIN

    if eff == "error" or bool(last_error):
        return HB_5_MIN

    if eff in ("running", "degraded") or desired_state == "running":
        return HB_15_MIN

    return HB_1_HOUR


def _should_insert_heartbeat_event(
    sb,
    *,
    user_id: str,
    bot_id: str,
    mode: str,
    sig: str,
    now_epoch: int,
    throttle_seconds: int,
) -> bool:
    """
    Insert heartbeat event if:
      - no prior heartbeat log
      - OR signature changed
      - OR last same-signature heartbeat is older than throttle_seconds
    Fail-open: if the check fails, we still insert.
    """
    try:
        res = (
            sb.table("bot_events")
            .select("ts,payload")
            .eq("user_id", user_id)
            .eq("bot_id", bot_id)
            .eq("mode", mode)
            .eq("event_type", "heartbeat")
            .order("ts", desc=True)
            .limit(1)
            .execute()
        )
        rows = getattr(res, "data", None) or []
        if not isinstance(rows, list) or not rows:
            return True

        row0 = rows[0] if isinstance(rows[0], dict) else {}
        last_ts_ep = parse_ts_to_epoch_seconds(row0.get("ts")) or 0

        last_payload = row0.get("payload")
        if not isinstance(last_payload, dict):
            last_payload = {}

        last_sig = _hb_signature(last_payload)

        if last_sig != sig:
            return True

        if last_ts_ep <= 0:
            return True

        age = max(0, int(now_epoch) - int(last_ts_ep))
        return age >= int(throttle_seconds)

    except Exception:
        return True


class BotService:
    """
    Production split-model service:

    - bot_configs: persistent config
    - bot_desired_state: control plane
    - bot_runtime_state: runtime/heartbeat plane
    - bot_events: append-only audit/events
    - bot_status_v: unified read model for status
    """

    BOT_CATALOG: List[Dict[str, Any]] = [
        {
            "id": "ema_trend",
            "name": "EMA Trend Bot",
            "description": "Trend-following EMA signals + risk gates.",
            "wired": True,
        },
        {
            "id": "orb",
            "name": "ORB Bot",
            "description": "Opening Range Breakout scanner + execution.",
            "wired": False,
        },
        {
            "id": "mean_revert",
            "name": "Mean Revert Bot",
            "description": "Mean reversion entries with confidence gating.",
            "wired": False,
        },
    ]

    def __init__(self) -> None:
        self.sb = get_supabase_service()

    # -------------------------
    # Catalog
    # -------------------------
    def _catalog_item(self, bot_id: str) -> Optional[Dict[str, Any]]:
        bid = str(bot_id or "").strip()
        if not bid:
            return None
        for b in self.BOT_CATALOG:
            if str(b.get("id") or "").strip() == bid:
                return b
        return None

    def _is_wired(self, bot_id: str) -> bool:
        b = self._catalog_item(bot_id)
        return bool(b and b.get("wired"))

    def _unavailable_payload(self, bot_id: str) -> Dict[str, Any]:
        bid = str(bot_id or "").strip()
        return {
            "ok": False,
            "code": "bot_unavailable",
            "detail": f"bot not available: {bid}",
            "bot_id": bid,
        }

    def _guard_wired_or_unavailable(self, bot_id: str) -> Optional[Dict[str, Any]]:
        bid = str(bot_id or "").strip()
        if not bid:
            return {"ok": False, "detail": "missing bot_id"}
        if not self._is_wired(bid):
            return self._unavailable_payload(bid)
        return None

    def available(self) -> Dict[str, Any]:
        bots: List[Dict[str, Any]] = []
        for b in self.BOT_CATALOG:
            if not b.get("wired"):
                continue
            bots.append(
                {
                    "id": str(b.get("id") or "").strip(),
                    "name": str(b.get("name") or "").strip(),
                    "description": str(b.get("description") or "").strip(),
                }
            )
        return {"ok": True, "bots": bots}

    # -------------------------
    # Config
    # -------------------------
    def get_config(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _read():
            res = (
                self.sb.table("bot_configs")
                .select("config,updated_at,enabled")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            data = getattr(res, "data", None) or {}
            cfg = data.get("config")
            if not isinstance(cfg, dict):
                cfg = {}
            return {
                "ok": True,
                "bot_id": bid,
                "config": cfg,
                "enabled": bool(data.get("enabled", True)),
            }

        return _safe_sb_execute(
            _read,
            default={"ok": True, "bot_id": bid, "config": {}, "enabled": True},
        )

    def set_config(self, user_id: str, bot_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        cfg = config if isinstance(config, dict) else {}
        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _write():
            now_iso = _epoch_to_iso_z(_now_epoch())
            self.sb.table("bot_configs").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "config": cfg,
                    "enabled": True,
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "config": cfg}

        return _safe_sb_execute(
            _write,
            default={"ok": False, "bot_id": bid, "detail": "failed to persist config"},
        )

    # -------------------------
    # Status / control
    # -------------------------
    def status(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        base: Dict[str, Any] = {
            "ok": True,
            "user_id": uid,
            "bot_id": bid,
            "intent": "stopped",
            "mode": "paper",
            "armed": False,
            "config": {},
            "effective_state": "stopped",
            "desired_state": "stopped",
            "message": "",
            "pausedReason": "",
            "lastError": "",
            "heartbeatAgeSec": None,
            "nextOpenEpoch": 0,
            "lastTickEpoch": 0,
            "lastIntents": 0,
            "lastIntentsAt": 0,
            "lastIntentsPreview": [],
        }

        def _latest_hb_event_from_events() -> Optional[Dict[str, Any]]:
            try:
                res = (
                    self.sb.table("bot_events")
                    .select("ts,payload")
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
                row0 = rows[0] if isinstance(rows[0], dict) else {}
                payload = row0.get("payload")
                if not isinstance(payload, dict):
                    payload = {}
                return {"ts": row0.get("ts"), "payload": payload}
            except Exception:
                return None

        def _overlay_from_hb_payload(out: Dict[str, Any], hb_payload: Dict[str, Any]) -> None:
            if not isinstance(hb_payload, dict) or not hb_payload:
                return

            hb_eff = str(hb_payload.get("effective_state") or "").strip().lower()
            if hb_eff == "paused":
                hb_eff = "stopped"

            if hb_eff:
                out["effective_state"] = hb_eff

            msg = str(hb_payload.get("message") or "").strip()
            if msg:
                out["message"] = msg

            pr = str(hb_payload.get("paused_reason") or "").strip()
            if pr:
                out["pausedReason"] = pr

            le = str(hb_payload.get("last_error") or "").strip()
            if le:
                out["lastError"] = le

            try:
                out["lastTickEpoch"] = int(hb_payload.get("last_tick") or out.get("lastTickEpoch") or 0)
            except Exception:
                pass

            try:
                out["nextOpenEpoch"] = int(hb_payload.get("next_open_epoch") or out.get("nextOpenEpoch") or 0)
            except Exception:
                pass

        def _read():
            out = dict(base)

            cfg = self.get_config(uid, bid).get("config") or {}
            out["config"] = cfg if isinstance(cfg, dict) else {}

            res = (
                self.sb.table("bot_status_v")
                .select("*")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            row = getattr(res, "data", None) or {}
            if not isinstance(row, dict):
                row = {}

            if not row:
                hb_ev = _latest_hb_event_from_events()
                hb_age = _heartbeat_age_or_none(hb_ev.get("ts")) if hb_ev else None
                out["heartbeatAgeSec"] = hb_age

                if hb_ev and isinstance(hb_ev.get("payload"), dict):
                    _overlay_from_hb_payload(out, hb_ev["payload"])  # type: ignore[arg-type]

                out["effective_state"] = _compute_effective_state(
                    runtime_state=out.get("effective_state"),
                    desired_state=out.get("desired_state"),
                    hb_age_sec=hb_age,
                )
                return out

            desired_state = _normalize_legacy_intent(str(row.get("desired_state") or "stopped"))
            mode = normalize_mode(row.get("mode") or "paper")
            armed = bool(row.get("armed") or False)

            hb_age = row.get("heartbeat_age_sec")
            try:
                hb_age = int(hb_age) if hb_age is not None else None
            except Exception:
                hb_age = None

            runtime_state = str(row.get("runtime_state") or "").strip().lower()
            if runtime_state == "paused":
                runtime_state = "stopped"

            effective_state = _compute_effective_state(
                runtime_state=runtime_state,
                desired_state=desired_state,
                hb_age_sec=hb_age,
            )

            out["intent"] = desired_state
            out["mode"] = mode
            out["armed"] = armed

            out["desired_state"] = desired_state
            out["effective_state"] = effective_state
            out["heartbeatAgeSec"] = hb_age

            out["message"] = str(row.get("runtime_message") or "").strip()
            out["pausedReason"] = str(row.get("paused_reason") or "").strip()

            last_error = str(row.get("last_error_message") or "").strip()
            if not last_error:
                last_error = str(row.get("last_error_type") or "").strip()
            out["lastError"] = last_error

            out["lastIntents"] = int(row.get("last_intents_count") or 0)
            out["lastIntentsAt"] = int(parse_ts_to_epoch_seconds(row.get("last_intents_at")) or 0)

            preview = row.get("last_intents_preview") or []
            out["lastIntentsPreview"] = preview if isinstance(preview, list) else []

            try:
                out["lastTickEpoch"] = int(row.get("last_tick_epoch") or 0)
            except Exception:
                out["lastTickEpoch"] = 0

            try:
                out["nextOpenEpoch"] = int(row.get("next_open_epoch") or 0)
            except Exception:
                out["nextOpenEpoch"] = 0

            hb_ev = _latest_hb_event_from_events()
            if hb_ev and isinstance(hb_ev.get("payload"), dict):
                if hb_age is None or hb_age > 30:
                    _overlay_from_hb_payload(out, hb_ev["payload"])  # type: ignore[arg-type]

            return out

        return _safe_sb_execute(_read, default=base)

    def arm(self, user_id: str, bot_id: str, mode: Optional[str]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        m = normalize_mode(mode) if mode else None

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _write():
            now_iso = _epoch_to_iso_z(_now_epoch())

            current = (
                self.sb.table("bot_desired_state")
                .select("desired_state,mode")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            data = getattr(current, "data", None) or {}
            current_desired = _normalize_legacy_intent(data.get("desired_state") or "stopped")
            current_mode = normalize_mode(data.get("mode") or (m or "paper"))

            self.sb.table("bot_desired_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "desired_state": current_desired,
                    "armed": True,
                    "mode": m or current_mode,
                    "requested_by": "user",
                    "reason": "",
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            self.sb.table("bot_events").insert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "mode": m or current_mode,
                    "ts": now_iso,
                    "level": "info",
                    "event_type": "arm",
                    "symbol": None,
                    "event_id": None,
                    "request_id": None,
                    "runner_id": None,
                    "payload": {"armed": True},
                }
            ).execute()

            return {"ok": True, "bot_id": bid, "armed": True, "mode": m or current_mode}

        return _safe_sb_execute(
            _write,
            default={"ok": False, "bot_id": bid, "detail": "failed to persist arm state"},
        )

    def disarm(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _write():
            now_iso = _epoch_to_iso_z(_now_epoch())

            current = (
                self.sb.table("bot_desired_state")
                .select("mode")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            data = getattr(current, "data", None) or {}
            current_mode = normalize_mode(data.get("mode") or "paper")

            self.sb.table("bot_desired_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "desired_state": "stopped",
                    "armed": False,
                    "mode": current_mode,
                    "requested_by": "user",
                    "reason": "Disarmed by user.",
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            self.sb.table("bot_runtime_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "runtime_state": "stopped",
                    "last_stopped_at": now_iso,
                    "message": "Disarmed by user.",
                    "paused_reason": "",
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            self.sb.table("bot_events").insert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "mode": current_mode,
                    "ts": now_iso,
                    "level": "info",
                    "event_type": "disarm",
                    "symbol": None,
                    "event_id": None,
                    "request_id": None,
                    "runner_id": None,
                    "payload": {"armed": False},
                }
            ).execute()

            return {"ok": True, "bot_id": bid, "armed": False}

        return _safe_sb_execute(
            _write,
            default={"ok": False, "bot_id": bid, "detail": "failed to persist disarm state"},
        )

    def start(self, user_id: str, bot_id: str, mode: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        m = normalize_mode(mode)

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _write():
            now_iso = _epoch_to_iso_z(_now_epoch())

            current = (
                self.sb.table("bot_desired_state")
                .select("armed")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            data = getattr(current, "data", None) or {}
            armed = bool(data.get("armed") or False)

            self.sb.table("bot_desired_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "desired_state": "running",
                    "armed": armed,
                    "mode": m,
                    "requested_by": "user",
                    "reason": "Start requested by user.",
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            self.sb.table("bot_runtime_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "runtime_state": "starting",
                    "last_started_at": now_iso,
                    "message": "Starting bot.",
                    "paused_reason": "",
                    "last_error_type": None,
                    "last_error_message": None,
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            self.sb.table("bot_events").insert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "mode": m,
                    "ts": now_iso,
                    "level": "info",
                    "event_type": "start",
                    "symbol": None,
                    "event_id": None,
                    "request_id": None,
                    "runner_id": None,
                    "payload": {"desired_state": "running", "armed": armed},
                }
            ).execute()

            return {"ok": True, "bot_id": bid, "intent": "running", "mode": m}

        return _safe_sb_execute(
            _write,
            default={"ok": False, "bot_id": bid, "detail": "failed to persist start state"},
        )

    def stop(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _write():
            now_iso = _epoch_to_iso_z(_now_epoch())

            current = (
                self.sb.table("bot_desired_state")
                .select("armed,mode")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            data = getattr(current, "data", None) or {}
            armed = bool(data.get("armed") or False)
            current_mode = normalize_mode(data.get("mode") or "paper")

            self.sb.table("bot_desired_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "desired_state": "stopped",
                    "armed": armed,
                    "mode": current_mode,
                    "requested_by": "user",
                    "reason": "Stopped by user.",
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            self.sb.table("bot_runtime_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "runtime_state": "stopped",
                    "last_stopped_at": now_iso,
                    "message": "Stopped by user.",
                    "paused_reason": "",
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            self.sb.table("bot_events").insert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "mode": current_mode,
                    "ts": now_iso,
                    "level": "info",
                    "event_type": "stop",
                    "symbol": None,
                    "event_id": None,
                    "request_id": None,
                    "runner_id": None,
                    "payload": {"desired_state": "stopped", "armed": armed},
                }
            ).execute()

            return {"ok": True, "bot_id": bid, "intent": "stopped"}

        return _safe_sb_execute(
            _write,
            default={"ok": False, "bot_id": bid, "detail": "failed to persist stop state"},
        )

    # -------------------------
    # Runner endpoints
    # -------------------------
    def heartbeat(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Writes:
        - bot_events: heartbeat event (THROTTLED per type)
        - bot_runtime_state: last_heartbeat + runtime fields

        IMPORTANT:
        Heartbeat updates runtime/freshness only.
        Control-plane desired_state/armed are owned by arm/start/stop/disarm.
        """
        uid = str(user_id or "").strip()
        bid = str(payload.get("bot_id") or "").strip()
        mode = normalize_mode(payload.get("mode") or "paper")
        runner_id = str(payload.get("runner_id") or "").strip() or None

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        eff = str(payload.get("effective_state") or "").strip().lower()
        if eff == "paused":
            eff = "stopped"

        message = str(payload.get("message") or "").strip()
        paused_reason = str(payload.get("paused_reason") or "").strip()
        last_error = str(payload.get("last_error") or "").strip()
        reason_code = str(payload.get("reason_code") or "").strip()

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
            now_ep = _now_epoch()
            now_iso = _epoch_to_iso_z(now_ep)

            try:
                sig = _hb_signature(payload if isinstance(payload, dict) else {})
                throttle_s = _heartbeat_throttle_seconds(payload if isinstance(payload, dict) else {})
                if _should_insert_heartbeat_event(
                    self.sb,
                    user_id=uid,
                    bot_id=bid,
                    mode=mode,
                    sig=sig,
                    now_epoch=now_ep,
                    throttle_seconds=throttle_s,
                ):
                    self.sb.table("bot_events").insert(
                        {
                            "user_id": uid,
                            "bot_id": bid,
                            "mode": mode,
                            "ts": now_iso,
                            "level": "info" if not last_error else "warn",
                            "event_type": "heartbeat",
                            "symbol": None,
                            "event_id": payload.get("event_id"),
                            "request_id": None,
                            "runner_id": runner_id,
                            "payload": payload,
                        }
                    ).execute()
            except Exception:
                pass

            patch: Dict[str, Any] = {
                "user_id": uid,
                "bot_id": bid,
                "last_heartbeat": now_iso,
                "runner_id": runner_id,
                "updated_at": now_iso,
                "message": message,
                "paused_reason": paused_reason,
                "last_error_type": reason_code or (("runner_error" if last_error else None)),
                "last_error_message": last_error or None,
                "last_tick_epoch": last_tick_epoch,
                "next_open_epoch": next_open_epoch_int,
            }

            if eff:
                patch["runtime_state"] = eff

            self.sb.table("bot_runtime_state").upsert(patch, on_conflict="user_id,bot_id").execute()
            return {"ok": True}

        return _safe_sb_execute(
            _write,
            default={"ok": False, "bot_id": bid, "detail": "failed to persist heartbeat"},
        )

    def submit_intents(self, user_id: str, bot_id: str, ts: int, items: List[Any]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        preview: List[Dict[str, Any]] = []
        for x in items[:5]:
            preview.append(x if isinstance(x, dict) else {"raw": x})

        def _write():
            now_iso = _epoch_to_iso_z(_now_epoch())
            intents_iso = _epoch_to_iso_z(int(ts or _now_epoch()))

            self.sb.table("bot_runtime_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "last_intents_at": intents_iso,
                    "last_intents_count": int(len(items)),
                    "last_intents_preview": preview,
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()

            if items:
                self.sb.table("bot_events").insert(
                    {
                        "user_id": uid,
                        "bot_id": bid,
                        "mode": "paper",
                        "ts": intents_iso,
                        "level": "info",
                        "event_type": "submit_intents",
                        "symbol": None,
                        "event_id": None,
                        "request_id": None,
                        "runner_id": None,
                        "payload": {"count": int(len(items)), "preview": preview},
                    }
                ).execute()

            return {"ok": True, "count": int(len(items)), "ts": int(ts or 0)}

        return _safe_sb_execute(
            _write,
            default={"ok": False, "bot_id": bid, "detail": "failed to persist intents"},
        )

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
        """
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        m = normalize_mode(mode)

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _read():
            q = (
                self.sb.table("bot_events")
                .select("ts,level,event_type,symbol,payload,event_id")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .eq("mode", m)
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

            items_out: List[Dict[str, Any]] = []
            for r in rows:
                if not isinstance(r, dict):
                    continue

                payload = r.get("payload")
                if not isinstance(payload, dict):
                    payload = {"raw": payload}

                items_out.append(
                    {
                        "ts": parse_ts_to_epoch_seconds(r.get("ts")),
                        "level": str(r.get("level") or "info").strip().lower(),
                        "event_type": str(r.get("event_type") or "").strip(),
                        "symbol": (str(r.get("symbol") or "").strip().upper() or None),
                        "event_id": str(r.get("event_id") or "").strip() or None,
                        "payload": payload,
                    }
                )

            return {"ok": True, "bot_id": bid, "mode": m, "items": items_out}

        return _safe_sb_execute(
            _read,
            default={"ok": True, "bot_id": bid, "mode": m, "items": []},
        )