from __future__ import annotations

"""Supabase persistence layer for bot control-plane and runtime-plane data."""

import logging
from typing import Any, Dict, List, Optional

from api.db import get_supabase_service

from api.core.bots.errors import BotServiceError
from api.core.bots.time_utils import epoch_to_iso_z

logger = logging.getLogger(__name__)


class BotRepository:
    """Repository for bot-related Supabase reads and writes."""

    def __init__(self) -> None:
        """Initializes the repository with a Supabase service client."""
        self.sb = get_supabase_service()

    def get_config_row(self, *, user_id: str, bot_id: str) -> Dict[str, Any]:
        """Returns a bot config row."""
        try:
            res = (
                self.sb.table("bot_configs")
                .select("user_id,bot_id,config,enabled,created_at,updated_at")
                .eq("user_id", user_id)
                .eq("bot_id", bot_id)
                .maybe_single()
                .execute()
            )
            data = getattr(res, "data", None) or {}
            return data if isinstance(data, dict) else {}
        except Exception as exc:
            raise BotServiceError(
                op_name="get_config_row",
                public_detail="failed to read bot config",
                internal_detail=str(exc),
            ) from exc

    def upsert_config_row(self, *, user_id: str, bot_id: str, config: Dict[str, Any], now_iso: str) -> None:
        """Upserts a bot config row."""
        try:
            self.sb.table("bot_configs").upsert(
                {
                    "user_id": user_id,
                    "bot_id": bot_id,
                    "config": config if isinstance(config, dict) else {},
                    "enabled": True,
                    "updated_at": now_iso,
                },
                on_conflict="user_id,bot_id",
            ).execute()
        except Exception as exc:
            raise BotServiceError(
                op_name="upsert_config_row",
                public_detail="failed to persist config",
                internal_detail=str(exc),
            ) from exc

    def get_desired_state_row(
        self,
        *,
        user_id: str,
        bot_id: str,
        columns: str = (
            "user_id,bot_id,desired_state,armed,mode,requested_by,"
            "request_id,reason,created_at,updated_at"
        ),
    ) -> Dict[str, Any]:
        """Returns a bot_desired_state row."""
        try:
            res = (
                self.sb.table("bot_desired_state")
                .select(columns)
                .eq("user_id", user_id)
                .eq("bot_id", bot_id)
                .maybe_single()
                .execute()
            )
            data = getattr(res, "data", None) or {}
            return data if isinstance(data, dict) else {}
        except Exception as exc:
            raise BotServiceError(
                op_name="get_desired_state_row",
                public_detail="failed to read desired state",
                internal_detail=str(exc),
            ) from exc

    def upsert_desired_state_row(self, *, row: Dict[str, Any]) -> None:
        """Upserts a bot_desired_state row."""
        try:
            self.sb.table("bot_desired_state").upsert(
                row,
                on_conflict="user_id,bot_id",
            ).execute()
        except Exception as exc:
            logger.exception("BotRepository upsert_desired_state_row failed", extra={"row": row})
            raise BotServiceError(
                op_name="upsert_desired_state_row",
                public_detail="failed to persist desired state",
                internal_detail=str(exc),
            ) from exc

    def get_runtime_state_row(
        self,
        *,
        user_id: str,
        bot_id: str,
        columns: str = (
            "user_id,bot_id,runtime_state,last_heartbeat,last_started_at,"
            "last_stopped_at,runner_id,last_error_type,last_error_message,"
            "paused_reason,updated_at,lease_expires_at,lease_token,"
            "last_claimed_at,created_at"
        ),
    ) -> Dict[str, Any]:
        """Returns a bot_runtime_state row."""
        try:
            res = (
                self.sb.table("bot_runtime_state")
                .select(columns)
                .eq("user_id", user_id)
                .eq("bot_id", bot_id)
                .maybe_single()
                .execute()
            )
            data = getattr(res, "data", None) or {}
            return data if isinstance(data, dict) else {}
        except Exception as exc:
            raise BotServiceError(
                op_name="get_runtime_state_row",
                public_detail="failed to read runtime state",
                internal_detail=str(exc),
            ) from exc

    def upsert_runtime_state_row(self, *, row: Dict[str, Any]) -> None:
        """Upserts a bot_runtime_state row."""
        try:
            self.sb.table("bot_runtime_state").upsert(
                row,
                on_conflict="user_id,bot_id",
            ).execute()
        except Exception as exc:
            logger.exception("BotRepository upsert_runtime_state_row failed", extra={"row": row})
            raise BotServiceError(
                op_name="upsert_runtime_state_row",
                public_detail="failed to persist runtime state",
                internal_detail=str(exc),
            ) from exc

    def insert_log_row(self, *, row: Dict[str, Any], fail_open: bool = False) -> None:
        """Inserts a bot_logs row."""
        try:
            self.sb.table("bot_logs").insert(row).execute()
        except Exception as exc:
            if fail_open:
                logger.exception("BotRepository insert_log_row failed (fail-open)")
                return
            raise BotServiceError(
                op_name="insert_log_row",
                public_detail="failed to persist bot log",
                internal_detail=str(exc),
            ) from exc

    def get_log_rows(
        self,
        *,
        user_id: str,
        bot_id: str,
        mode: str,
        limit: int,
        start_ts: int,
        end_ts: int,
    ) -> List[Dict[str, Any]]:
        """Returns filtered bot log rows.

        Notes:
            We no longer rely on bot_events. Logs come from bot_logs.
            Mode is optional in the new schema, so we filter by details->mode
            only when it exists.
        """
        try:
            query = (
                self.sb.table("bot_logs")
                .select(
                    "ts,level,source,action,status,visible_to_user,"
                    "user_message,technical_message,request_id,runner_id,"
                    "desired_state,runtime_state,details,meta"
                )
                .eq("user_id", user_id)
                .eq("bot_id", bot_id)
                .order("ts", desc=True)
                .limit(int(limit))
            )

            if int(end_ts or 0) > 0:
                query = query.lt("ts", epoch_to_iso_z(int(end_ts) + 1))
            if int(start_ts or 0) > 0:
                query = query.gte("ts", epoch_to_iso_z(int(start_ts)))

            res = query.execute()
            rows = getattr(res, "data", None) or []
            if not isinstance(rows, list):
                return []

            normalized_rows: List[Dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue

                details = row.get("details")
                if not isinstance(details, dict):
                    details = {}

                # Optional soft mode filter from structured payload.
                row_mode = str(details.get("mode") or "").strip().lower()
                if mode and row_mode and row_mode != str(mode).strip().lower():
                    continue

                normalized = dict(row)
                normalized["details"] = details
                normalized_rows.append(normalized)

            return normalized_rows
        except Exception as exc:
            raise BotServiceError(
                op_name="get_log_rows",
                public_detail="failed to read bot log",
                internal_detail=str(exc),
            ) from exc

    def get_recent_logs(
        self,
        *,
        user_id: str,
        bot_id: str,
        limit: int = 20,
        visible_to_user: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        """Returns recent logs for quick status/debug lookups."""
        try:
            query = (
                self.sb.table("bot_logs")
                .select(
                    "ts,level,source,action,status,visible_to_user,"
                    "user_message,technical_message,request_id,runner_id,"
                    "desired_state,runtime_state,details"
                )
                .eq("user_id", user_id)
                .eq("bot_id", bot_id)
                .order("ts", desc=True)
                .limit(int(limit))
            )

            if visible_to_user is not None:
                query = query.eq("visible_to_user", bool(visible_to_user))

            res = query.execute()
            rows = getattr(res, "data", None) or []
            return rows if isinstance(rows, list) else []
        except Exception as exc:
            raise BotServiceError(
                op_name="get_recent_logs",
                public_detail="failed to read recent logs",
                internal_detail=str(exc),
            ) from exc