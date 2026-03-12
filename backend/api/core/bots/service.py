from __future__ import annotations

"""Service layer for bot control-plane and runtime-plane operations."""

import logging
from typing import Any, Dict, List, Optional

from api.core.bots.constants import BOT_CATALOG
from api.core.bots.errors import BotServiceError, failure_response
from api.core.bots.repository import BotRepository
from api.core.bots.state_machine import (
    compute_effective_state,
    heartbeat_age_or_none,
    normalize_desired_state,
    normalize_runtime_state,
)
from api.core.bots.time_utils import epoch_to_iso_z, now_epoch
from api.core.bots.validators import normalize_mode, parse_ts_to_epoch_seconds

logger = logging.getLogger(__name__)


class BotService:
    """Service layer for bot control-plane and runtime-plane state."""

    BOT_CATALOG = BOT_CATALOG

    def __init__(self) -> None:
        """Initializes the bot service."""
        self.repo = BotRepository()

    def _catalog_item(self, bot_id: str) -> Optional[Dict[str, Any]]:
        normalized_bot_id = str(bot_id or "").strip()
        if not normalized_bot_id:
            return None

        for bot in self.BOT_CATALOG:
            if str(bot.get("id") or "").strip() == normalized_bot_id:
                return bot
        return None

    def _is_wired(self, bot_id: str) -> bool:
        bot = self._catalog_item(bot_id)
        return bool(bot and bot.get("wired"))

    def _unavailable_payload(self, bot_id: str) -> Dict[str, Any]:
        normalized_bot_id = str(bot_id or "").strip()
        return {
            "ok": False,
            "code": "bot_unavailable",
            "detail": f"bot not available: {normalized_bot_id}",
            "bot_id": normalized_bot_id,
        }

    def _guard_wired_or_unavailable(self, bot_id: str) -> Optional[Dict[str, Any]]:
        normalized_bot_id = str(bot_id or "").strip()
        if not normalized_bot_id:
            return {"ok": False, "detail": "missing bot_id"}
        if not self._is_wired(normalized_bot_id):
            return self._unavailable_payload(normalized_bot_id)
        return None

    def _safe_log(
        self,
        *,
        user_id: str,
        bot_id: str,
        level: str = "info",
        source: str = "system",
        action: str = "log",
        status: str = "info",
        user_message: str = "",
        technical_message: str = "",
        mode: Optional[str] = None,
        request_id: Optional[str] = None,
        runner_id: Optional[str] = None,
        visible_to_user: bool = True,
        desired_state: Optional[str] = None,
        runtime_state: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ts_iso: Optional[str] = None,
    ) -> None:
        """Best-effort structured audit log writer."""
        try:
            details_payload = details.copy() if isinstance(details, dict) else {}
            if mode:
                details_payload.setdefault("mode", str(mode).strip().lower())

            self.repo.insert_log_row(
                row={
                    "user_id": user_id,
                    "bot_id": bot_id,
                    "ts": ts_iso or epoch_to_iso_z(now_epoch()),
                    "level": str(level or "info").strip().lower(),
                    "source": str(source or "system").strip().lower(),
                    "action": str(action or "log").strip().lower(),
                    "status": str(status or "info").strip().lower(),
                    "visible_to_user": bool(visible_to_user),
                    "user_message": str(user_message or "").strip(),
                    "technical_message": str(technical_message or "").strip(),
                    "request_id": request_id,
                    "runner_id": runner_id,
                    "desired_state": desired_state,
                    "runtime_state": runtime_state,
                    "details": details_payload,
                    "meta": details_payload,
                },
                fail_open=True,
            )
        except Exception:
            logger.exception("BotService _safe_log failed")
    def _derive_runtime_message(self, runtime_row: Dict[str, Any]) -> str:
        """Builds a user-facing runtime message from runtime state."""
        if not isinstance(runtime_row, dict):
            return ""

        runtime_state = normalize_runtime_state(runtime_row.get("runtime_state"))
        paused_reason = str(runtime_row.get("paused_reason") or "").strip()
        last_error_message = str(runtime_row.get("last_error_message") or "").strip()
        last_error_type = str(runtime_row.get("last_error_type") or "").strip()

        if runtime_state == "starting":
            return "Bot is starting."
        if runtime_state == "running":
            return "Bot is running."
        if runtime_state == "stopping":
            return "Bot is stopping."
        if runtime_state == "offline":
            return "Bot is stopped."
        if runtime_state == "errored":
            if last_error_message:
                return last_error_message
            if last_error_type:
                return f"Bot error: {last_error_type}"
            return "Bot hit an error."
        if paused_reason:
            return paused_reason
        return ""

    def available(self) -> Dict[str, Any]:
        bots: List[Dict[str, Any]] = []
        for bot in self.BOT_CATALOG:
            if not bot.get("wired"):
                continue
            bots.append(
                {
                    "id": str(bot.get("id") or "").strip(),
                    "name": str(bot.get("name") or "").strip(),
                    "description": str(bot.get("description") or "").strip(),
                }
            )
        return {"ok": True, "bots": bots}

    def get_config(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        try:
            row = self.repo.get_config_row(user_id=normalized_user_id, bot_id=normalized_bot_id)
            config = row.get("config")
            if not isinstance(config, dict):
                config = {}
            return {
                "ok": True,
                "bot_id": normalized_bot_id,
                "config": config,
                "enabled": bool(row.get("enabled", True)),
            }
        except BotServiceError:
            logger.exception("BotService get_config failed")
            return {"ok": True, "bot_id": normalized_bot_id, "config": {}, "enabled": True}

    def set_config(self, user_id: str, bot_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()
        normalized_config = config if isinstance(config, dict) else {}

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        try:
            now_iso = epoch_to_iso_z(now_epoch())
            self.repo.upsert_config_row(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                config=normalized_config,
                now_iso=now_iso,
            )
            self._safe_log(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                source="api",
                action="config_loaded",
                status="success",
                user_message="Bot configuration updated.",
                technical_message="Config upserted successfully.",
                details={"config_keys": sorted(list(normalized_config.keys()))},
                ts_iso=now_iso,
            )
            return {"ok": True, "bot_id": normalized_bot_id, "config": normalized_config}
        except BotServiceError:
            logger.exception("BotService set_config failed")
            return failure_response(bot_id=normalized_bot_id, detail="failed to persist config")

    def status(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        """Reads unified bot status for the frontend from base tables only."""
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        base: Dict[str, Any] = {
            "ok": True,
            "user_id": normalized_user_id,
            "bot_id": normalized_bot_id,
            "intent": "stopped",
            "mode": "paper",
            "armed": False,
            "config": {},
            "enabled": True,
            "effective_state": "stopped",
            "desired_state": "stopped",
            "runtime_state": "offline",
            "message": "",
            "pausedReason": "",
            "lastError": "",
            "heartbeatAgeSec": None,
            "lastHeartbeatAt": None,
            "lastStartedAt": None,
            "lastStoppedAt": None,
            "runnerId": None,
        }

        try:
            out = dict(base)

            config_row = self.repo.get_config_row(user_id=normalized_user_id, bot_id=normalized_bot_id)
            config = config_row.get("config")
            out["config"] = config if isinstance(config, dict) else {}
            out["enabled"] = bool(config_row.get("enabled", True))

            desired_row = self.repo.get_desired_state_row(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
            )
            runtime_row = self.repo.get_runtime_state_row(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
            )

            desired_state = normalize_desired_state(desired_row.get("desired_state") or "stopped")
            mode = normalize_mode(desired_row.get("mode") or "paper")
            armed = bool(desired_row.get("armed") or False)

            runtime_state = normalize_runtime_state(runtime_row.get("runtime_state") or "offline")
            hb_age = heartbeat_age_or_none(runtime_row.get("last_heartbeat"))

            effective_state = compute_effective_state(
                runtime_state=runtime_state,
                desired_state=desired_state,
                hb_age_sec=hb_age,
            )

            # Convert "offline while desired stopped" to "stopped" for the frontend
            if effective_state == "offline" and desired_state == "stopped":
                effective_state = "stopped"

            out["intent"] = desired_state
            out["mode"] = mode
            out["armed"] = armed
            out["desired_state"] = desired_state
            out["runtime_state"] = runtime_state
            out["effective_state"] = effective_state
            out["heartbeatAgeSec"] = hb_age
            out["lastHeartbeatAt"] = runtime_row.get("last_heartbeat")
            out["lastStartedAt"] = runtime_row.get("last_started_at")
            out["lastStoppedAt"] = runtime_row.get("last_stopped_at")
            out["runnerId"] = runtime_row.get("runner_id")

            paused_reason = str(runtime_row.get("paused_reason") or "").strip()
            out["pausedReason"] = paused_reason

            last_error = str(runtime_row.get("last_error_message") or "").strip()
            if not last_error:
                last_error = str(runtime_row.get("last_error_type") or "").strip()
            out["lastError"] = last_error

            out["message"] = self._derive_runtime_message(runtime_row)

            return out
        except BotServiceError:
            logger.exception("BotService status failed")
            return base

    def arm(self, user_id: str, bot_id: str, mode: Optional[str]) -> Dict[str, Any]:
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()
        normalized_mode = normalize_mode(mode) if mode else None

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        try:
            now_iso = epoch_to_iso_z(now_epoch())

            current = self.repo.get_desired_state_row(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                columns="desired_state,mode",
            )
            current_desired_state = normalize_desired_state(current.get("desired_state") or "stopped")
            current_mode = normalize_mode(current.get("mode") or (normalized_mode or "paper"))

            self.repo.upsert_desired_state_row(
                row={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "desired_state": current_desired_state,
                    "armed": True,
                    "mode": normalized_mode or current_mode,
                    "requested_by": "user",
                    "reason": "Armed by user.",
                    "updated_at": now_iso,
                }
            )

            self._safe_log(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                source="api",
                action="request_arm",
                status="success",
                user_message="Bot armed.",
                technical_message="Arm request persisted to bot_desired_state.",
                mode=normalized_mode or current_mode,
                desired_state=current_desired_state,
                details={"armed": True},
                ts_iso=now_iso,
            )

            return self.status(normalized_user_id, normalized_bot_id)
        except BotServiceError:
            logger.exception("BotService arm failed")
            return failure_response(bot_id=normalized_bot_id, detail="failed to persist arm state")

    def disarm(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        try:
            now_iso = epoch_to_iso_z(now_epoch())

            current = self.repo.get_desired_state_row(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                columns="mode",
            )
            current_mode = normalize_mode(current.get("mode") or "paper")

            self.repo.upsert_desired_state_row(
                row={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "desired_state": "stopped",
                    "armed": False,
                    "mode": current_mode,
                    "requested_by": "user",
                    "reason": "Disarmed by user.",
                    "updated_at": now_iso,
                }
            )

            self.repo.upsert_runtime_state_row(
                row={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "runtime_state": "offline",
                    "last_stopped_at": now_iso,
                    "paused_reason": "",
                    "last_error_type": None,
                    "last_error_message": None,
                    "updated_at": now_iso,
                }
            )

            self._safe_log(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                source="api",
                action="request_disarm",
                status="success",
                user_message="Bot disarmed.",
                technical_message="Disarm request persisted; runtime marked offline.",
                mode=current_mode,
                desired_state="stopped",
                runtime_state="offline",
                details={"armed": False},
                ts_iso=now_iso,
            )

            return self.status(normalized_user_id, normalized_bot_id)
        except BotServiceError:
            logger.exception("BotService disarm failed")
            return failure_response(bot_id=normalized_bot_id, detail="failed to persist disarm state")

    def start(self, user_id: str, bot_id: str, mode: str) -> Dict[str, Any]:
        """Requests that a bot start running.

        Start auto-arms the bot so the runner and UI converge faster.
        """
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()
        normalized_mode = normalize_mode(mode)

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        try:
            now_iso = epoch_to_iso_z(now_epoch())

            self.repo.upsert_desired_state_row(
                row={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "desired_state": "running",
                    "armed": True,
                    "mode": normalized_mode,
                    "requested_by": "user",
                    "reason": "Start requested by user.",
                    "updated_at": now_iso,
                }
            )

            self.repo.upsert_runtime_state_row(
                row={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "runtime_state": "starting",
                    "last_started_at": now_iso,
                    "paused_reason": "",
                    "last_error_type": None,
                    "last_error_message": None,
                    "updated_at": now_iso,
                }
            )

            self._safe_log(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                source="api",
                action="request_start",
                status="success",
                user_message="Start requested.",
                technical_message="Desired state set to running; runtime set to starting.",
                mode=normalized_mode,
                desired_state="running",
                runtime_state="starting",
                details={"armed": True},
                ts_iso=now_iso,
            )

            return self.status(normalized_user_id, normalized_bot_id)
        except BotServiceError:
            logger.exception("BotService start failed")
            return failure_response(bot_id=normalized_bot_id, detail="failed to persist start state")

    def stop(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        try:
            now_iso = epoch_to_iso_z(now_epoch())

            current = self.repo.get_desired_state_row(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                columns="armed,mode",
            )
            armed = bool(current.get("armed") or False)
            current_mode = normalize_mode(current.get("mode") or "paper")

            self.repo.upsert_desired_state_row(
                row={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "desired_state": "stopped",
                    "armed": armed,
                    "mode": current_mode,
                    "requested_by": "user",
                    "reason": "Stopped by user.",
                    "updated_at": now_iso,
                }
            )

            self.repo.upsert_runtime_state_row(
                row={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "runtime_state": "stopping",
                    "last_stopped_at": now_iso,
                    "paused_reason": "",
                    "updated_at": now_iso,
                }
            )

            self._safe_log(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                source="api",
                action="request_stop",
                status="success",
                user_message="Stop requested.",
                technical_message="Desired state set to stopped; runtime set to stopping.",
                mode=current_mode,
                desired_state="stopped",
                runtime_state="stopping",
                details={"armed": armed},
                ts_iso=now_iso,
            )

            return self.status(normalized_user_id, normalized_bot_id)
        except BotServiceError:
            logger.exception("BotService stop failed")
            return failure_response(bot_id=normalized_bot_id, detail="failed to persist stop state")

    def heartbeat(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Persists runner heartbeat data.

        Heartbeat owns runtime freshness and runner-reported runtime state only.
        """
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(payload.get("bot_id") or "").strip()
        mode = normalize_mode(payload.get("mode") or "paper")
        runner_id = str(payload.get("runner_id") or "").strip() or None

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        runtime_state = normalize_runtime_state(payload.get("effective_state") or payload.get("runtime_state"))
        if not runtime_state:
            runtime_state = "running"

        paused_reason = str(payload.get("paused_reason") or "").strip()
        last_error = str(payload.get("last_error") or "").strip()
        reason_code = str(payload.get("reason_code") or "").strip()

        try:
            now_iso = epoch_to_iso_z(now_epoch())

            current_runtime = self.repo.get_runtime_state_row(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                columns="runtime_state,last_started_at,last_stopped_at",
            )
            previous_runtime_state = normalize_runtime_state(current_runtime.get("runtime_state") or "offline")
            previous_last_started_at = current_runtime.get("last_started_at")

            patch: Dict[str, Any] = {
                "user_id": normalized_user_id,
                "bot_id": normalized_bot_id,
                "runtime_state": runtime_state,
                "last_heartbeat": now_iso,
                "runner_id": runner_id,
                "paused_reason": paused_reason,
                "last_error_type": reason_code or ("runner_error" if last_error else None),
                "last_error_message": last_error or None,
                "updated_at": now_iso,
            }

            if runtime_state == "running" and (
                previous_runtime_state != "running" or not previous_last_started_at
            ):
                patch["last_started_at"] = now_iso

            if runtime_state in {"offline", "stopping"}:
                patch["last_stopped_at"] = now_iso

            self.repo.upsert_runtime_state_row(row=patch)

            self._safe_log(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                source="runner",
                action="heartbeat",
                status="warning" if last_error else "info",
                user_message="Heartbeat received." if not last_error else "Heartbeat received with warnings.",
                technical_message=(
                    f"Heartbeat persisted with runtime_state={runtime_state}, "
                    f"runner_id={runner_id or 'none'}, reason_code={reason_code or 'none'}."
                ),
                mode=mode,
                runner_id=runner_id,
                runtime_state=runtime_state,
                visible_to_user=False,
                details=payload if isinstance(payload, dict) else {},
                ts_iso=now_iso,
            )

            if last_error:
                self._safe_log(
                    user_id=normalized_user_id,
                    bot_id=normalized_bot_id,
                    level="error",
                    source="runner",
                    action="error",
                    status="error",
                    user_message="Bot hit an error.",
                    technical_message=last_error,
                    mode=mode,
                    runner_id=runner_id,
                    runtime_state=runtime_state,
                    details={
                        "reason_code": reason_code,
                        "payload": payload if isinstance(payload, dict) else {},
                    },
                    ts_iso=now_iso,
                )

            return {"ok": True, "bot_id": normalized_bot_id}
        except Exception as exc:
            logger.exception(
                "BotService heartbeat failed",
                extra={
                    "user_id": normalized_user_id,
                    "bot_id": normalized_bot_id,
                    "runner_id": runner_id,
                    "payload": payload,
                    "error": str(exc),
                },
            )
            return failure_response(bot_id=normalized_bot_id, detail="failed to persist heartbeat")

    def submit_intents(self, user_id: str, bot_id: str, ts: int, items: List[Any]) -> Dict[str, Any]:
        """Persists intent activity as logs only.

        Intent summary columns were removed from runtime state, so this is now
        purely an audit/debug path.
        """
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        preview: List[Dict[str, Any]] = []
        for item in items[:5]:
            preview.append(item if isinstance(item, dict) else {"raw": item})

        try:
            intents_iso = epoch_to_iso_z(int(ts or now_epoch()))

            if items:
                self._safe_log(
                    user_id=normalized_user_id,
                    bot_id=normalized_bot_id,
                    source="runner",
                    action="log",
                    status="info",
                    user_message=f"Runner submitted {len(items)} intents.",
                    technical_message="Intent summary recorded to bot_logs.",
                    visible_to_user=False,
                    details={"count": int(len(items)), "preview": preview},
                    ts_iso=intents_iso,
                )

            return {"ok": True, "count": int(len(items)), "ts": int(ts or 0)}
        except BotServiceError:
            logger.exception("BotService submit_intents failed")
            return failure_response(bot_id=normalized_bot_id, detail="failed to persist intents")

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
        """Reads structured bot log entries."""
        normalized_user_id = str(user_id or "").strip()
        normalized_bot_id = str(bot_id or "").strip()
        normalized_mode = normalize_mode(mode)

        if not normalized_user_id or not normalized_bot_id:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        guard = self._guard_wired_or_unavailable(normalized_bot_id)
        if guard:
            return guard

        try:
            rows = self.repo.get_log_rows(
                user_id=normalized_user_id,
                bot_id=normalized_bot_id,
                mode=normalized_mode,
                limit=int(limit),
                start_ts=int(start_ts),
                end_ts=int(end_ts),
            )

            items_out: List[Dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue

                details = row.get("details")
                if not isinstance(details, dict):
                    details = {}

                items_out.append(
                    {
                        "ts": parse_ts_to_epoch_seconds(row.get("ts")),
                        "level": str(row.get("level") or "info").strip().lower(),
                        "source": str(row.get("source") or "system").strip().lower(),
                        "action": str(row.get("action") or "log").strip().lower(),
                        "status": str(row.get("status") or "info").strip().lower(),
                        "user_message": str(row.get("user_message") or "").strip(),
                        "technical_message": str(row.get("technical_message") or "").strip(),
                        "visible_to_user": bool(row.get("visible_to_user", True)),
                        "request_id": str(row.get("request_id") or "").strip() or None,
                        "runner_id": str(row.get("runner_id") or "").strip() or None,
                        "desired_state": str(row.get("desired_state") or "").strip() or None,
                        "runtime_state": str(row.get("runtime_state") or "").strip() or None,
                        "details": details,
                    }
                )

            return {
                "ok": True,
                "bot_id": normalized_bot_id,
                "mode": normalized_mode,
                "items": items_out,
            }
        except BotServiceError:
            logger.exception("BotService get_log failed")
            return {"ok": True, "bot_id": normalized_bot_id, "mode": normalized_mode, "items": []}

    def send_stopped(
        api: UStockAPI,
        state: HeartbeatState,
        *,
        bot_id: str,
        status_mode: str,
        user_id: Optional[str] = None,
    ) -> None:
        """Backward-compatible wrapper for older runner call sites."""
        send_offline(
            api,
            state,
            bot_id=bot_id,
            status_mode=status_mode,
            user_id=user_id,
            reason_code="intent_stopped",
            message="Control plane indicates stopped.",
        )