# backend/api/routes/trade_fills_ingest.py
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

# Update these imports to your repo paths:
from api.supabase_client import supabase_service_client  # service role
from api.crypto_utils import decrypt_secret
# If you don’t have decrypt_secret, stub it and we’ll wire it next.

router = APIRouter()
RUNNER_TOKEN = os.getenv("RUNNER_TOKEN", "")


# -----------------------
# Models
# -----------------------
class TradeFillIn(BaseModel):
    user_id: str
    provider: str = "alpaca"
    account_type: str = "paper"

    bot_id: Optional[str] = None
    strategy: Optional[str] = None
    run_id: Optional[str] = None

    order_id: Optional[str] = None
    fill_id: Optional[str] = None

    symbol: str
    side: str
    qty: float = Field(gt=0)
    price: float = Field(ge=0)

    commission: Optional[float] = None
    fees: Optional[float] = None

    filled_at: datetime
    venue: Optional[str] = None
    liquidity: Optional[str] = None
    raw: dict = {}


class IngestBody(BaseModel):
    items: List[TradeFillIn]


class SyncBody(BaseModel):
    user_id: str
    bot_id: str
    mode: str = "paper"  # paper/live
    # optional cursor override (usually not needed)
    after: Optional[str] = None


# -----------------------
# Auth
# -----------------------
def _require_runner(x_runner_token: str) -> None:
    if not RUNNER_TOKEN:
        raise HTTPException(status_code=500, detail="RUNNER_TOKEN not set")
    if x_runner_token != RUNNER_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


# -----------------------
# Helper: load alpaca creds from integrations (encrypted)
# -----------------------
def _load_alpaca_creds(sb, user_id: str, mode: str) -> Dict[str, str]:
    """
    integrations columns you gave:
    mode, api_secret_enc, api_key_enc, created_at, id, updated_at, config, status, provider, user_id
    """
    mode_norm = (mode or "paper").strip().lower()
    if mode_norm not in ("paper", "live"):
        mode_norm = "paper"

    res = (
        sb.table("integrations")
        .select("provider, status, mode, api_key_enc, api_secret_enc")
        .eq("user_id", user_id)
        .eq("provider", "alpaca")
        .eq("mode", mode_norm)
        .limit(1)
        .execute()
    )

    if getattr(res, "error", None):
        raise HTTPException(status_code=400, detail=str(res.error))

    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(status_code=400, detail="Alpaca integration not found for user")

    if str(row.get("status") or "").lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca integration is not connected")

    key_enc = row.get("api_key_enc") or ""
    sec_enc = row.get("api_secret_enc") or ""
    if not key_enc or not sec_enc:
        raise HTTPException(status_code=400, detail="Alpaca keys missing")

    api_key = decrypt_secret(key_enc)
    api_secret = decrypt_secret(sec_enc)

    return {"key": api_key, "secret": api_secret, "mode": mode_norm}


# -----------------------
# Helper: cursor storage in bot_runtime_state
# -----------------------
def _cursor_key(user_id: str, bot_id: str, mode: str) -> str:
    return f"fills_cursor:{mode}:{bot_id}"


def _get_cursor(sb, user_id: str, bot_id: str, mode: str) -> Optional[str]:
    # Assumes bot_runtime_state has: user_id, bot_id, state/json, updated_at etc.
    # If your schema differs, tell me and I’ll adjust.
    res = (
        sb.table("bot_runtime_state")
        .select("state")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .limit(1)
        .execute()
    )
    if getattr(res, "error", None):
        return None
    row = (res.data or [None])[0]
    state = row.get("state") if row else None
    if isinstance(state, dict):
        return state.get(_cursor_key(user_id, bot_id, mode))
    return None


def _set_cursor(sb, user_id: str, bot_id: str, mode: str, cursor_iso: str) -> None:
    # Upsert runtime state with cursor in state json
    res = (
        sb.table("bot_runtime_state")
        .select("state")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .limit(1)
        .execute()
    )
    existing = (res.data or [None])[0]
    state = existing.get("state") if existing and isinstance(existing.get("state"), dict) else {}
    state[_cursor_key(user_id, bot_id, mode)] = cursor_iso

    up = (
        sb.table("bot_runtime_state")
        .upsert(
            {"user_id": user_id, "bot_id": bot_id, "state": state, "updated_at": datetime.now(timezone.utc).isoformat()},
            on_conflict="user_id,bot_id",
        )
        .execute()
    )
    if getattr(up, "error", None):
        raise HTTPException(status_code=400, detail=str(up.error))


# -----------------------
# Normalize Alpaca fills -> trade_fills rows
# -----------------------
def _normalize_alpaca_fill(fill: Dict[str, Any], *, user_id: str, bot_id: str, mode: str) -> Dict[str, Any]:
    # Alpaca payloads vary by endpoint. We store raw and map common keys.
    filled_at = fill.get("transaction_time") or fill.get("filled_at") or fill.get("timestamp")
    if not filled_at:
        filled_at = datetime.now(timezone.utc).isoformat()

    return {
        "user_id": user_id,
        "provider": "alpaca",
        "account_type": mode,
        "bot_id": bot_id,

        "order_id": str(fill.get("order_id") or ""),
        "fill_id": str(fill.get("id") or fill.get("trade_id") or ""),

        "symbol": str(fill.get("symbol") or "").upper(),
        "side": str(fill.get("side") or "").lower(),
        "qty": float(fill.get("qty") or fill.get("quantity") or 0),
        "price": float(fill.get("price") or 0),

        "filled_at": filled_at,
        "raw": fill,
    }


# -----------------------
# 1) Runner ingest (optional)
# -----------------------
@router.post("/api/trade_fills/ingest")
def ingest_trade_fills(
    body: IngestBody,
    x_runner_token: str = Header(default="", alias="X-Runner-Token"),
):
    _require_runner(x_runner_token)

    sb = supabase_service_client()
    rows = [i.model_dump() for i in body.items]

    res = sb.table("trade_fills").upsert(rows, on_conflict="user_id,provider,fill_id").execute()
    if getattr(res, "error", None):
        raise HTTPException(status_code=400, detail=str(res.error))

    return {"upserted": len(res.data or [])}


# -----------------------
# 2) Recommended: Backend pulls Alpaca + upserts
# -----------------------
@router.post("/api/trade_fills/sync_runner")
def sync_trade_fills_runner(
    body: SyncBody,
    x_runner_token: str = Header(default="", alias="X-Runner-Token"),
):
    """
    Runner calls this each loop (or every N loops).
    Backend decrypts keys + talks to Alpaca, then writes trade_fills.
    """
    _require_runner(x_runner_token)

    sb = supabase_service_client()
    creds = _load_alpaca_creds(sb, body.user_id, body.mode)

    # Cursor
    after = body.after or _get_cursor(sb, body.user_id, body.bot_id, creds["mode"])

    # --- Alpaca call (choose ONE Alpaca client approach you already use) ---
    # If you already have alpaca_trading code in backend, import and reuse it.
    # Below is pseudo-ish: replace with your real Alpaca fetch for fills/activities.

    fills: List[Dict[str, Any]] = []

    # TODO: implement using the Alpaca SDK you're already using in backend.
    # Example options:
    # - activities endpoint (fills)
    # - orders endpoint (filled orders)
    #
    # fills = alpaca_list_fills(api_key=creds["key"], api_secret=creds["secret"], paper=(creds["mode"]=="paper"), after=after)

    if not isinstance(fills, list):
        fills = []

    items = [_normalize_alpaca_fill(f, user_id=body.user_id, bot_id=body.bot_id, mode=creds["mode"]) for f in fills]
    if items:
        up = sb.table("trade_fills").upsert(items, on_conflict="user_id,provider,fill_id").execute()
        if getattr(up, "error", None):
            raise HTTPException(status_code=400, detail=str(up.error))

        # move cursor to latest filled_at
        latest = items[-1].get("filled_at")
        if latest:
            _set_cursor(sb, body.user_id, body.bot_id, creds["mode"], str(latest))

    return {"synced": len(items)}
