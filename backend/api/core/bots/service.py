# backend/api/core/bots/service.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Tuple

from api.db import get_supabase_service
from api.core.bots.validators import parse_ts_to_epoch_seconds, normalize_mode


def _now_epoch() -> int:
    return int(time.time())


def _epoch_to_iso_z(ep: int) -> str:
    import time as _t
    return _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime(int(ep)))


def _safe_sb_execute(fn, *, default: Any):
    """
    Supabase python client can throw if table doesn't exist, etc.
    We do NOT want bots endpoints to 500 for missing tables.
    """
    try:
        return fn()
    except Exception:
        return default


class BotService:
    """
    Must satisfy api/routes/bots.py:
      - available()
      - status(user_id, bot_id)
      - arm(user_id, bot_id, mode?)
      - disarm(user_id, bot_id)
      - start(user_id, bot_id, mode)
      - stop(user_id, bot_id)
      - get_log(user_id, bot_id, ...)
      - get_config(user_id, bot_id)
      - set_config(user_id, bot_id, config)
      - heartbeat(user_id, payload)
      - submit_intents(user_id, bot_id, ts, items)
    """

    def __init__(self) -> None:
        self.sb = get_supabase_service()

    # -------------------------
    # Catalog
    # -------------------------
    def available(self) -> Dict[str, Any]:
        # Keep aligned with your frontend expectations.
        # You can later make this DB-driven.
        items = [
            {"bot_id": "ema_trend", "label": "EMA Trend"},
            {"bot_id": "orb", "label": "ORB"},
            {"bot_id": "mean_revert", "label": "Mean Revert"},
        ]
        return {"ok": True, "items": items}

    # -------------------------
    # Config
    # -------------------------
    def get_config(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        if not uid or not bid:
            return {"ok": False, "detail": "missing user_id/bot_id"}

        # Try read from bot_configs (if you have it). Otherwise empty.
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

        # Default safe status (UI + runner won't crash)
        base = {
            "ok": True,
            "user_id": uid,
            "bot_id": bid,
            "intent": "paused",
            "mode": "paper",
            "armed": False,
            "config": {},
            # intents snapshot fields expected by /intents endpoint:
            "lastIntents": 0,
            "lastIntentsAt": 0,
            "lastIntentsPreview": [],
        }

        # Try read from bot_state if it exists
        def _read():
            res = (
                self.sb.table("bot_state")
                .select("*")
                .eq("user_id", uid)
                .eq("bot_id", bid)
                .maybe_single()
                .execute()
            )
            row = getattr(res, "data", None) or {}
            if not isinstance(row, dict) or not row:
                # still try config
                cfg = self.get_config(uid, bid).get("config") or {}
                out = dict(base)
                out["config"] = cfg if isinstance(cfg, dict) else {}
                return out

            out = dict(base)
            out["intent"] = str(row.get("intent") or out["intent"]).strip().lower()
            out["mode"] = normalize_mode(row.get("mode") or out["mode"])
            out["armed"] = bool(row.get("armed") or False)
            # attach config
            cfg = self.get_config(uid, bid).get("config") or {}
            out["config"] = cfg if isinstance(cfg, dict) else {}
            # intents snapshot
            out["lastIntents"] = int(row.get("last_intents_count") or 0)
            out["lastIntentsAt"] = int(parse_ts_to_epoch_seconds(row.get("last_intents_at")) or 0)
            preview = row.get("last_intents_preview") or []
            out["lastIntentsPreview"] = preview if isinstance(preview, list) else []
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
                {"user_id": uid, "bot_id": bid, "armed": False, "intent": "paused", "updated_at": _epoch_to_iso_z(_now_epoch())},
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
                {"user_id": uid, "bot_id": bid, "intent": "running", "mode": m, "updated_at": _epoch_to_iso_z(_now_epoch())},
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "intent": "running", "mode": m}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "intent": "running", "mode": m})

    def stop(self, user_id: str, bot_id: str) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        def _write():
            self.sb.table("bot_state").upsert(
                {"user_id": uid, "bot_id": bid, "intent": "paused", "updated_at": _epoch_to_iso_z(_now_epoch())},
                on_conflict="user_id,bot_id",
            ).execute()
            return {"ok": True, "bot_id": bid, "intent": "paused"}

        return _safe_sb_execute(_write, default={"ok": True, "bot_id": bid, "intent": "paused"})

    # -------------------------
    # Runner endpoints
    # -------------------------
    def heartbeat(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(payload.get("bot_id") or "").strip()
        mode = normalize_mode(payload.get("mode") or "paper")

        # Store as event (you already have bot_events table in /events)
        def _write():
            self.sb.table("bot_events").insert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "mode": mode,
                    "ts": _epoch_to_iso_z(_now_epoch()),
                    "level": "info",
                    "event_type": "heartbeat",
                    "symbol": None,
                    "event_id": payload.get("event_id"),
                    "payload": payload,
                }
            ).execute()

            # also touch bot_state if exists
            self.sb.table("bot_state").upsert(
                {
                    "user_id": uid,
                    "bot_id": bid,
                    "mode": mode,
                    "last_heartbeat_at": _epoch_to_iso_z(_now_epoch()),
                    "updated_at": _epoch_to_iso_z(_now_epoch()),
                },
                on_conflict="user_id,bot_id",
            ).execute()

            return {"ok": True}

        return _safe_sb_execute(_write, default={"ok": True})

    def submit_intents(self, user_id: str, bot_id: str, ts: int, items: List[Any]) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()
        preview: List[Dict[str, Any]] = []
        for x in items[:5]:
            preview.append(x if isinstance(x, dict) else {"raw": x})

        def _write():
            # store snapshot onto bot_state (if table exists)
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

    # -------------------------
    # Logs (simple: read bot_events)
    # -------------------------
    def get_log(self, user_id: str, bot_id: str, *, limit: int, start_ts: int, end_ts: int) -> Dict[str, Any]:
        uid = str(user_id or "").strip()
        bid = str(bot_id or "").strip()

        def _read():
            q = (
                self.sb.table("bot_events")
                .select("ts,level,event_type,symbol,payload,event_id")
                .eq("user_id", uid)
                .eq("bot_id", bid)
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

            return {"ok": True, "bot_id": bid, "items": items}

        return _safe_sb_execute(_read, default={"ok": True, "bot_id": bid, "items": []})
