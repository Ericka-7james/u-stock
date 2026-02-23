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


def _normalize_legacy_intent(it: Any) -> str:
    """
    Backwards-compat: older rows may still contain 'paused'.
    Canonical lifecycle intents are: running | stopped.
    """
    v = str(it or "").strip().lower()
    if v == "paused":
        return "stopped"
    return v


def _compute_desired_state(*, armed: bool, intent: str) -> str:
    it = _normalize_legacy_intent(intent)
    if it == "running":
        return "running"
    if armed:
        return "armed"
    return "stopped"


def _compute_effective_state(*, row_eff: Any, intent: str, hb_age_sec: Optional[int]) -> str:
    eff = str(row_eff or "").strip().lower()
    it = _normalize_legacy_intent(intent)

    # Backwards-compat: if DB has old "paused" effective_state, treat as stopped.
    if eff == "paused":
        eff = "stopped"

    # No heartbeat yet
    if hb_age_sec is None:
        if it == "running":
            return "starting"
        return "stopped"

    # Stale heartbeat -> offline
    if hb_age_sec > 90:
        return "offline"

    # Prefer runner-reported state if present
    if eff:
        return eff

    # Fallback
    if it == "running":
        return "running"
    return "stopped"


# -------------------------
# Heartbeat log throttling (per-type)
# -------------------------
HB_5_MIN = 5 * 60
HB_15_MIN = 15 * 60
HB_1_HOUR = 60 * 60


def _hb_signature(payload: Dict[str, Any]) -> str:
    """
    Stable signature so we can avoid spamming bot_events when nothing changes.
    """
    if not isinstance(payload, dict):
        payload = {}

    intent = _normalize_legacy_intent(payload.get("intent"))
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
            f"intent={intent}",
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
    Detect your noisy case: 'blocked: no valid intents'
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

    intent = _normalize_legacy_intent(payload.get("intent"))
    reason_code = str(payload.get("reason_code") or "").strip().lower()
    last_error = str(payload.get("last_error") or "").strip()

    # 1) Your spammy case
    if _is_blocked_no_valid_intents(payload):
        return HB_1_HOUR

    # 2) Market waiting — useful but still noisy
    if eff == "waiting_for_market" or reason_code == "market_closed":
        return HB_5_MIN

    # 3) Starting
    if eff == "starting":
        return HB_5_MIN

    # 4) Error states
    if eff == "error" or bool(last_error):
        return HB_5_MIN

    # 5) Running / degraded (less frequent)
    if eff in ("running", "degraded") or intent == "running":
        return HB_15_MIN

    # Default: keep noise down
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

        # signature changed -> always log
        if last_sig != sig:
            return True

        # same signature -> throttle
        if last_ts_ep <= 0:
            return True

        age = max(0, int(now_epoch) - int(last_ts_ep))
        return age >= int(throttle_seconds)

    except Exception:
        return True


class BotService:
    """
    This version keeps your existing API shapes (available() returns {"ok": True, "bots": [...]})
    but adds a "wired" flag and ONLY returns wired bots from available().

    It also makes status/control endpoints return a consistent "bot_unavailable" payload
    so the UI can unselect the bot and stop polling.
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
        # IMPORTANT: keep your current response shape {"ok": True, "bots": [...]}
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

        return _safe_sb_execute(_read, default={"ok": True, "bot_id": bid, "config": {}})

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

        def _hb_age_from_events() -> Optional[int]:
            ev = _latest_hb_event_from_events()
            if not ev:
                return None
            return _heartbeat_age_or_none(ev.get("ts"))

        def _overlay_from_hb_payload(out: Dict[str, Any], hb_payload: Dict[str, Any]) -> None:
            if not isinstance(hb_payload, dict) or not hb_payload:
                return

            hb_intent = _normalize_legacy_intent(hb_payload.get("intent"))
            hb_eff = str(hb_payload.get("effective_state") or "").strip().lower()
            if hb_eff == "paused":
                hb_eff = "stopped"

            if hb_intent in ("running", "stopped"):
                out["intent"] = hb_intent
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
                out["lastTickEpoch"] = int(hb_payload.get("last_tick") or 0)
            except Exception:
                pass
            try:
                out["nextOpenEpoch"] = int(hb_payload.get("next_open_epoch") or 0)
            except Exception:
                pass

            out["desired_state"] = _compute_desired_state(armed=bool(out.get("armed")), intent=str(out.get("intent")))

        def _read():
            out = dict(base)

            cfg = self.get_config(uid, bid).get("config") or {}
            out["config"] = cfg if isinstance(cfg, dict) else {}

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

            if not row:
                hb_age = _hb_age_from_events()
                out["heartbeatAgeSec"] = hb_age

                hb_ev = _latest_hb_event_from_events()
                if hb_ev and isinstance(hb_ev.get("payload"), dict):
                    _overlay_from_hb_payload(out, hb_ev["payload"])  # type: ignore[arg-type]

                out["desired_state"] = _compute_desired_state(armed=False, intent=str(out.get("intent") or "stopped"))
                out["effective_state"] = _compute_effective_state(
                    row_eff=str(out.get("effective_state") or ""),
                    intent=str(out.get("intent") or "stopped"),
                    hb_age_sec=hb_age,
                )
                return out

            intent = _normalize_legacy_intent(str(row.get("intent") or out["intent"]).strip().lower())
            mode = normalize_mode(row.get("mode") or out["mode"])
            armed = bool(row.get("armed") or False)

            hb_age = _heartbeat_age_or_none(row.get("last_heartbeat_at"))
            if hb_age is None:
                hb_age = _hb_age_from_events()

            desired = str(row.get("desired_state") or "").strip().lower() or _compute_desired_state(armed=armed, intent=intent)
            if desired == "paused":
                desired = "stopped"

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

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _write():
            self.sb.table("bot_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "armed": False,
                    "desired_state": "disarmed",
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

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

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

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        def _write():
            self.sb.table("bot_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "intent": "stopped",
                    "desired_state": "stopped",
                    "updated_at": _epoch_to_iso_z(_now_epoch()),
                },
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "intent": "stopped"}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "intent": "stopped"})

    # -------------------------
    # Runner endpoints
    # -------------------------
    def heartbeat(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Writes:
        - bot_events: heartbeat event (THROTTLED per type)
        - bot_state: last_heartbeat_at + state fields (best-effort, every time)
        """
        uid = str(user_id or "").strip()
        bid = str(payload.get("bot_id") or "").strip()
        mode = normalize_mode(payload.get("mode") or "paper")

        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(bid)
        if guard:
            return guard

        intent = _normalize_legacy_intent(payload.get("intent"))
        eff = str(payload.get("effective_state") or "").strip().lower()
        if eff == "paused":
            eff = "stopped"

        message = str(payload.get("message") or "").strip()
        paused_reason = str(payload.get("paused_reason") or "").strip()
        last_error = str(payload.get("last_error") or "").strip()

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

            # 1) Insert bot_events heartbeat only if signature changed OR same-signature older than throttle window
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
                            "level": "info",
                            "event_type": "heartbeat",
                            "symbol": None,
                            "event_id": payload.get("event_id"),
                            "payload": payload,
                        }
                    ).execute()
            except Exception:
                pass

            # 2) ALWAYS patch bot_state (freshness + offline detection)
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

            try:
                self.sb.table("bot_state").upsert(patch, on_conflict="user_id,bot_id").execute()
            except Exception:
                pass

            return {"ok": True}

        return _safe_sb_execute(_write, default={"ok": True})

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

        return _safe_sb_execute(_read, default={"ok": True, "bot_id": bid, "mode": m, "items": []})