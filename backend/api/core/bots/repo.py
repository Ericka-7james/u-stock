from __future__ import annotations

from typing import Any, Dict, Optional

from api.db import get_supabase_service
from api.core.bots.validators import iso_now


class BotRepo:
    def __init__(self):
        self.sb = get_supabase_service()

    def get_desired_state(self, user_id: str, bot_id: str) -> str:
        res = (
            self.sb.table("bot_desired_state")
            .select("desired_state")
            .eq("user_id", user_id)
            .eq("bot_id", bot_id)
            .maybe_single()
            .execute()
        )
        row = getattr(res, "data", None) or {}
        desired = str(row.get("desired_state") or "paused").lower()
        return desired if desired in ("running", "paused") else "paused"

    def set_desired_state(self, user_id: str, bot_id: str, desired_state: str) -> None:
        self.sb.table("bot_desired_state").upsert(
            {"user_id": user_id, "bot_id": bot_id, "desired_state": desired_state, "updated_at": iso_now()},
            on_conflict="user_id,bot_id",
        ).execute()

    def get_runtime_state(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        res = (
            self.sb.table("bot_runtime_state")
            .select("*")
            .eq("user_id", user_id)
            .eq("bot_id", bot_id)
            .maybe_single()
            .execute()
        )
        return getattr(res, "data", None) or {}

    def upsert_runtime_state(self, user_id: str, bot_id: str, patch: Dict[str, Any]) -> None:
        row = {"user_id": user_id, "bot_id": bot_id, **patch, "updated_at": iso_now()}
        self.sb.table("bot_runtime_state").upsert(row, on_conflict="user_id,bot_id").execute()

    def get_config(self, user_id: str, bot_id: str, default_cfg: Dict[str, Any]) -> Dict[str, Any]:
        res = (
            self.sb.table("bot_configs")
            .select("config")
            .eq("user_id", user_id)
            .eq("bot_id", bot_id)
            .maybe_single()
            .execute()
        )
        row = getattr(res, "data", None) or {}
        cfg = row.get("config")
        return cfg if isinstance(cfg, dict) else default_cfg

    def set_config(self, user_id: str, bot_id: str, cfg: Dict[str, Any]) -> None:
        self.sb.table("bot_configs").upsert(
            {"user_id": user_id, "bot_id": bot_id, "config": cfg, "updated_at": iso_now()},
            on_conflict="user_id,bot_id",
        ).execute()

    def get_logs(self, user_id: str, bot_id: str, limit: int) -> list[Dict[str, Any]]:
        res = (
            self.sb.table("bot_logs")
            .select("ts,level,message,meta")
            .eq("user_id", user_id)
            .eq("bot_id", bot_id)
            .order("ts", desc=True)
            .limit(int(limit))
            .execute()
        )
        return getattr(res, "data", None) or []

    def insert_log(self, user_id: str, bot_id: str, level: str, message: str, meta: Optional[Dict[str, Any]] = None) -> None:
        self.sb.table("bot_logs").insert(
            {"user_id": user_id, "bot_id": bot_id, "ts": iso_now(), "level": str(level or "info").lower(), "message": str(message or ""), "meta": meta or {}}
        ).execute()
