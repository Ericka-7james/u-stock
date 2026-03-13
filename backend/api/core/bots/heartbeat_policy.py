from __future__ import annotations

"""Heartbeat signature and throttling policy for bot runtime events."""

from typing import Any, Dict

from api.core.bots.constants import HB_5_MIN, HB_15_MIN, HB_30_MIN, HB_1_HOUR
from api.core.bots.state_machine import normalize_desired_state, normalize_runtime_state
from api.core.bots.time_utils import safe_int
from api.core.bots.validators import normalize_mode, parse_ts_to_epoch_seconds


def hb_signature(payload: Dict[str, Any]) -> str:
    """Builds a stable heartbeat signature for deduplication.

    Args:
        payload: Raw heartbeat payload.

    Returns:
        Stable signature string used for heartbeat throttling.
    """
    if not isinstance(payload, dict):
        payload = {}

    desired_state = normalize_desired_state(payload.get("desired_state") or payload.get("intent"))
    effective_state = normalize_runtime_state(payload.get("effective_state"))
    mode = normalize_mode(payload.get("mode") or "paper")

    message = str(payload.get("message") or "").strip()
    paused_reason = str(payload.get("paused_reason") or "").strip()
    last_error = str(payload.get("last_error") or "").strip()
    reason_code = str(payload.get("reason_code") or "").strip()
    next_open_epoch = safe_int(payload.get("next_open_epoch"), 0)

    return "|".join(
        [
            f"desired={desired_state}",
            f"eff={effective_state}",
            f"mode={mode}",
            f"reason={reason_code}",
            f"next_open={next_open_epoch}",
            f"msg={message}",
            f"paused={paused_reason}",
            f"err={last_error}",
        ]
    )


def is_blocked_no_valid_intents(payload: Dict[str, Any]) -> bool:
    """Detects the noisy no-valid-intents heartbeat case.

    Args:
        payload: Raw heartbeat payload.

    Returns:
        True if the payload represents a no-valid-intents blocked condition.
    """
    if not isinstance(payload, dict):
        return False

    message = str(payload.get("message") or "").strip().lower()
    paused_reason = str(payload.get("paused_reason") or "").strip().lower()
    reason_code = str(payload.get("reason_code") or "").strip().lower()

    blob = " ".join([message, paused_reason, reason_code]).strip()
    if "no valid intents" in blob:
        return True
    if "no_valid_intents" in blob:
        return True
    if reason_code.startswith("blocked") and ("intent" in blob or "valid" in blob):
        return True
    return False


def heartbeat_throttle_seconds(payload: Dict[str, Any]) -> int:
    """Returns the bot_events throttle interval for heartbeat logging.

    Args:
        payload: Raw heartbeat payload.

    Returns:
        Throttle interval in seconds.
    """
    if not isinstance(payload, dict):
        return HB_1_HOUR

    effective_state = normalize_runtime_state(payload.get("effective_state"))
    desired_state = normalize_desired_state(payload.get("desired_state") or payload.get("intent"))
    reason_code = str(payload.get("reason_code") or "").strip().lower()
    last_error = str(payload.get("last_error") or "").strip()

    if is_blocked_no_valid_intents(payload):
        return HB_1_HOUR

    if effective_state == "waiting_for_market" or reason_code == "market_closed":
        return HB_30_MIN

    if effective_state in {"starting", "paused"}:
        return HB_5_MIN

    if effective_state == "error" or bool(last_error):
        return HB_5_MIN

    if effective_state in {"running", "degraded"} or desired_state == "running":
        return HB_15_MIN

    return HB_1_HOUR


def should_insert_heartbeat_event(
    sb,
    *,
    user_id: str,
    bot_id: str,
    mode: str,
    sig: str,
    now_epoch: int,
    throttle_seconds: int,
) -> bool:
    """Determines whether to insert a heartbeat bot_event row.

    Args:
        sb: Supabase client.
        user_id: Owning user ID.
        bot_id: Bot identifier.
        mode: Bot mode.
        sig: Current heartbeat signature.
        now_epoch: Current time in epoch seconds.
        throttle_seconds: Minimum interval for same-signature inserts.

    Returns:
        True if a new heartbeat event should be inserted.
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
        last_ts_epoch = parse_ts_to_epoch_seconds(row0.get("ts")) or 0

        last_payload = row0.get("payload")
        if not isinstance(last_payload, dict):
            last_payload = {}

        last_sig = hb_signature(last_payload)

        if last_sig != sig:
            return True

        if last_ts_epoch <= 0:
            return True

        age_seconds = max(0, int(now_epoch) - int(last_ts_epoch))
        return age_seconds >= int(throttle_seconds)
    except Exception:
        return True