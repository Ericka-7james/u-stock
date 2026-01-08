import os
import time
import traceback
from dotenv import load_dotenv
from supabase import create_client
from bots.orb import ORBBot

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
RUNNER_ID = os.getenv("RUNNER_ID", "local-runner").strip()

POLL_SECONDS = int(os.getenv("POLL_SECONDS", "3"))
HEARTBEAT_SECONDS = int(os.getenv("HEARTBEAT_SECONDS", "10"))

if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in runner/.env")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

SUPPORTED_BOTS = ["orb", "ema_vwap"]  # ema_vwap later
bots = {
    "orb": ORBBot(sb=sb, runner_id=RUNNER_ID),
}

_last_hb_runtime = {}  # (user_id, bot_id) -> epoch
_last_hb_log = {}      # (user_id, bot_id) -> epoch


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def log(user_id: str, bot_id: str, level: str, message: str, meta=None):
    meta = meta or {}
    sb.table("bot_logs").insert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "level": level,
            "message": message,
            "meta": meta,
        }
    ).execute()


def set_runtime(user_id: str, bot_id: str, runtime_state: str, **fields):
    row = {
        "user_id": user_id,
        "bot_id": bot_id,
        "runtime_state": runtime_state,
        "runner_id": RUNNER_ID,
        "updated_at": iso_now(),
        **fields,
    }
    sb.table("bot_runtime_state").upsert(row, on_conflict="user_id,bot_id").execute()


def set_desired(user_id: str, bot_id: str, desired_state: str):
    sb.table("bot_desired_state").upsert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "desired_state": desired_state,
            "updated_at": iso_now(),
        },
        on_conflict="user_id,bot_id",
    ).execute()


def ensure_rows_for_user(user_id: str):
    for bot_id in SUPPORTED_BOTS:
        existing_cfg = (
            sb.table("bot_configs")
            .select("user_id,bot_id")
            .eq("user_id", user_id)
            .eq("bot_id", bot_id)
            .limit(1)
            .execute()
            .data
        )
        if not existing_cfg:
            cfg = {}
            enabled = False
            if bot_id == "orb":
                cfg = {
                    "enabled": False,
                    "symbols_mode": "static",
                    "symbols": ["SPY"],
                    "range_minutes": 5,
                    "entry_buffer_cents": 2,
                    "confirm_close": True,
                    "allow_shorts": False,
                    "risk_per_trade_pct": 0.005,
                    "rr_take_profit": 1.5,
                    "partial_tp": True,
                    "max_trades_per_symbol": 1,
                    "max_total_trades": 3,
                    "cooldown_minutes": 10,
                    "max_daily_loss_usd": 50,
                    "trade_end_time_et": "11:00",
                    "filters": {
                        "vwap": True,
                        "min_or_range_pct": 0.001,
                        "max_or_range_pct": 0.02,
                    },
                    "auto_pause_on_strategy_error": True,
                }
                enabled = False

            sb.table("bot_configs").upsert(
                {
                    "user_id": user_id,
                    "bot_id": bot_id,
                    "config": cfg,
                    "enabled": enabled,
                    "updated_at": iso_now(),
                },
                on_conflict="user_id,bot_id",
            ).execute()

        sb.table("bot_desired_state").upsert(
            {
                "user_id": user_id,
                "bot_id": bot_id,
                "desired_state": "paused",
                "updated_at": iso_now(),
            },
            on_conflict="user_id,bot_id",
        ).execute()

        sb.table("bot_runtime_state").upsert(
            {
                "user_id": user_id,
                "bot_id": bot_id,
                "runtime_state": "idle",
                "updated_at": iso_now(),
            },
            on_conflict="user_id,bot_id",
        ).execute()


def load_users_with_bot_rows():
    rows = sb.table("bot_desired_state").select("user_id").limit(50).execute().data or []
    return sorted(list({r["user_id"] for r in rows if r.get("user_id")}))


def get_config(user_id: str, bot_id: str) -> dict:
    rows = (
        sb.table("bot_configs")
        .select("config,enabled")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return {}
    cfg = rows[0].get("config") or {}
    cfg["enabled"] = bool(rows[0].get("enabled", False))
    return cfg


def get_desired(user_id: str, bot_id: str) -> str:
    rows = (
        sb.table("bot_desired_state")
        .select("desired_state")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return "paused"
    return (rows[0].get("desired_state") or "paused").lower()


def heartbeat_runtime(user_id: str, bot_id: str, runtime_state="running"):
    now = time.time()
    last = _last_hb_runtime.get((user_id, bot_id), 0)
    if now - last < HEARTBEAT_SECONDS:
        return
    _last_hb_runtime[(user_id, bot_id)] = now
    set_runtime(user_id, bot_id, runtime_state=runtime_state, last_heartbeat=iso_now())


def heartbeat_log(user_id: str, bot_id: str, desired: str, enabled: bool, runtime_state: str):
    now = time.time()
    last = _last_hb_log.get((user_id, bot_id), 0)
    if now - last < HEARTBEAT_SECONDS:
        return
    _last_hb_log[(user_id, bot_id)] = now
    log(
        user_id,
        bot_id,
        "info",
        "heartbeat",
        {
            "runner_id": RUNNER_ID,
            "desired_state": desired,
            "enabled": enabled,
            "runtime_state": runtime_state,
            "ts": iso_now(),
        },
    )


def main():
    print(f"Runner starting: {RUNNER_ID}")

    while True:
        try:
            user_ids = load_users_with_bot_rows()

            if not user_ids:
                time.sleep(POLL_SECONDS)
                continue

            user_id = user_ids[0]
            ensure_rows_for_user(user_id)

            for bot_id in SUPPORTED_BOTS:
                desired = get_desired(user_id, bot_id)
                cfg = get_config(user_id, bot_id)
                enabled = bool(cfg.get("enabled", False))

                # Always log heartbeat so you can verify runner even when paused/disabled
                runtime_state = "paused" if desired != "running" else ("idle" if not enabled else "running")
                heartbeat_log(user_id, bot_id, desired, enabled, runtime_state)

                if desired != "running":
                    heartbeat_runtime(user_id, bot_id, runtime_state="paused")
                    if bot_id in bots:
                        bots[bot_id].request_stop()
                    continue

                if not enabled:
                    heartbeat_runtime(user_id, bot_id, runtime_state="idle")
                    continue

                b = bots.get(bot_id)
                if not b:
                    continue

                try:
                    heartbeat_runtime(user_id, bot_id, runtime_state="running")
                    b.step(user_id=user_id, config=cfg)
                except Exception as e:
                    msg = f"{type(e).__name__}: {str(e)}"
                    tb = traceback.format_exc(limit=8)

                    log(user_id, bot_id, "error", f"Strategy error: {msg}", {"trace": tb})
                    set_runtime(
                        user_id,
                        bot_id,
                        runtime_state="error",
                        last_error_type="strategy",
                        last_error_message=msg,
                        last_heartbeat=iso_now(),
                    )

                    auto_pause = bool(cfg.get("auto_pause_on_strategy_error", True))
                    if auto_pause:
                        set_desired(user_id, bot_id, "paused")
                        log(user_id, bot_id, "warn", "Auto-paused due to strategy error (won’t auto-restart).")

            time.sleep(POLL_SECONDS)

        except KeyboardInterrupt:
            print("Runner stopped by user.")
            break
        except Exception as e:
            print("Runner loop error:", re# runner/main.py
"""
U-Stock Local Bot Runner (Supabase-backed)

What this runner does:
- Stays alive 24/7 on your laptop (as long as Windows doesn't sleep)
- Reconnects automatically if network/DNS drops
- Polls Supabase for each bot's desired_state + enabled flag
- Maintains bot_runtime_state + heartbeat
- Writes bot_logs (including heartbeat logs you can view in Supabase)

Tables expected (you already created these):
- bot_configs
- bot_desired_state
- bot_runtime_state
- bot_logs

ENV expected (runner/.env):
- SUPABASE_URL=...
- SUPABASE_SERVICE_ROLE_KEY=...   (recommended for the runner)
- RUNNER_ID=local-win-1 (optional)
- POLL_SECONDS=3 (optional)
- HEARTBEAT_SECONDS=15 (optional)
- HEARTBEAT_LOG_EVERY=60 (optional; logs are expensive)
"""

from __future__ import annotations

import os
import time
import socket
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from supabase import create_client


# ----------------------------
# Env / Setup
# ----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"), override=False)

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in runner/.env")

RUNNER_ID = (os.getenv("RUNNER_ID") or f"local-{socket.gethostname()}").strip()

POLL_SECONDS = int(os.getenv("POLL_SECONDS", "3"))
HEARTBEAT_SECONDS = int(os.getenv("HEARTBEAT_SECONDS", "15"))
HEARTBEAT_LOG_EVERY = int(os.getenv("HEARTBEAT_LOG_EVERY", "60"))  # write heartbeat logs less frequently


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_sb():
    # IMPORTANT: we recreate this client after network errors
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ----------------------------
# Bot registry
# ----------------------------
@dataclass
class BotContext:
    user_id: str
    bot_id: str
    config: Dict[str, Any]


class BaseBot:
    """
    Simple skeleton: each bot implements `tick()`.
    tick() is called while bot is in desired_state=running AND enabled=True.

    If you want "runner always on but bot trades only at market time":
    - keep the runner running always
    - inside tick(): check market hours and simply "do nothing" outside market hours
    """

    def __init__(self, ctx: BotContext):
        self.ctx = ctx
        self.started_at_iso = now_iso()

    def tick(self, sb) -> None:
        raise NotImplementedError


class ORBBot(BaseBot):
    def tick(self, sb) -> None:
        # Placeholder: implement real ORB logic later.
        # For now: just emit a lightweight log occasionally.
        # (The runner already emits heartbeats; this is "strategy heartbeat".)
        pass


BOT_REGISTRY = {
    "orb": ORBBot,
    # "ema_vwap": EMAVWAPBot,  # later
}


# ----------------------------
# Supabase helpers
# ----------------------------
def log_line(sb, user_id: str, bot_id: str, level: str, message: str, meta: Optional[Dict[str, Any]] = None) -> None:
    meta = meta or {}
    sb.table("bot_logs").insert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "ts": now_iso(),
            "level": level,
            "message": message,
            "meta": meta,
        }
    ).execute()


def upsert_runtime_state(
    sb,
    user_id: str,
    bot_id: str,
    runtime_state: str,
    last_error_type: Optional[str] = None,
    last_error_message: Optional[str] = None,
    last_started_at: Optional[str] = None,
    last_stopped_at: Optional[str] = None,
) -> None:
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "bot_id": bot_id,
        "runtime_state": runtime_state,
        "runner_id": RUNNER_ID,
        "last_heartbeat": now_iso(),
        "updated_at": now_iso(),
    }
    if last_error_type is not None:
        payload["last_error_type"] = last_error_type
    if last_error_message is not None:
        payload["last_error_message"] = last_error_message
    if last_started_at is not None:
        payload["last_started_at"] = last_started_at
    if last_stopped_at is not None:
        payload["last_stopped_at"] = last_stopped_at

    sb.table("bot_runtime_state").upsert(payload, on_conflict="user_id,bot_id").execute()


def fetch_enabled_configs(sb) -> Dict[tuple[str, str], Dict[str, Any]]:
    """
    Returns map keyed by (user_id, bot_id) => { enabled, config }
    """
    res = sb.table("bot_configs").select("user_id,bot_id,enabled,config,updated_at").execute()
    rows = res.data or []
    out: Dict[tuple[str, str], Dict[str, Any]] = {}
    for r in rows:
        key = (str(r["user_id"]), str(r["bot_id"]))
        out[key] = {
            "enabled": bool(r.get("enabled", False)),
            "config": r.get("config") or {},
            "updated_at": r.get("updated_at"),
        }
    return out


def fetch_desired_state(sb) -> Dict[tuple[str, str], str]:
    """
    Returns map keyed by (user_id, bot_id) => desired_state ('running'|'paused')
    """
    res = sb.table("bot_desired_state").select("user_id,bot_id,desired_state,updated_at").execute()
    rows = res.data or []
    out: Dict[tuple[str, str], str] = {}
    for r in rows:
        key = (str(r["user_id"]), str(r["bot_id"]))
        out[key] = str(r.get("desired_state") or "paused")
    return out


# ----------------------------
# Runner loop
# ----------------------------
class Runner:
    def __init__(self):
        self.sb = make_sb()
        self.last_global_ok = 0.0
        self.last_heartbeat_log_at: Dict[tuple[str, str], float] = {}
        self.live_bots: Dict[tuple[str, str], BaseBot] = {}  # (user_id, bot_id) -> bot instance

    def rebuild_client(self):
        self.sb = make_sb()

    def run_forever(self):
        print(f"Runner starting: {RUNNER_ID}")

        backoff = 2  # grows to max_backoff on repeated network/system issues
        max_backoff = 30

        while True:
            try:
                self.single_iteration()
                backoff = 2  # reset backoff after success
                time.sleep(POLL_SECONDS)
            except Exception as e:
                # Treat this as a system/network issue
                print("Runner loop error:", repr(e))

                # try to recreate Supabase client (key for DNS/network drop recovery)
                try:
                    self.rebuild_client()
                    print("Supabase client recreated")
                except Exception as rebuild_err:
                    print("Failed to recreate Supabase client:", repr(rebuild_err))

                # Backoff to avoid spamming while wifi/dns is down
                time.sleep(backoff)
                backoff = min(max_backoff, backoff + 4)

    def single_iteration(self):
        sb = self.sb

        configs = fetch_enabled_configs(sb)
        desired = fetch_desired_state(sb)

        # Ensure we at least touch runtime state for every known config row
        for (user_id, bot_id), cfg in configs.items():
            enabled = bool(cfg["enabled"])
            desired_state = desired.get((user_id, bot_id), "paused").lower().strip()
            desired_state = desired_state if desired_state in ("running", "paused") else "paused"

            # Decide what to do
            should_run = enabled and desired_state == "running"
            key = (user_id, bot_id)

            if should_run:
                self.ensure_started(user_id, bot_id, cfg.get("config") or {})
                self.heartbeat(user_id, bot_id, runtime_state="running")
                self.tick_bot(user_id, bot_id)
            else:
                # Not running: keep runtime state accurate but don't kill bot object aggressively
                # (We can keep it in memory; it just won't tick.)
                state = "paused" if desired_state == "paused" else "idle"
                self.heartbeat(user_id, bot_id, runtime_state=state)

        # If a bot is running in memory but config rows disappear, mark stale.
        # (Usually won't happen, but safe.)
        for key in list(self.live_bots.keys()):
            if key not in configs:
                user_id, bot_id = key
                upsert_runtime_state(sb, user_id, bot_id, runtime_state="stale", last_error_type="system",
                                    last_error_message="config row missing")
                del self.live_bots[key]

    def ensure_started(self, user_id: str, bot_id: str, config: Dict[str, Any]):
        sb = self.sb
        key = (user_id, bot_id)

        if key in self.live_bots:
            return

        bot_cls = BOT_REGISTRY.get(bot_id)
        if not bot_cls:
            # unknown bot id
            upsert_runtime_state(sb, user_id, bot_id, runtime_state="error",
                                last_error_type="strategy",
                                last_error_message=f"Unknown bot_id: {bot_id}")
            log_line(sb, user_id, bot_id, "error", f"Unknown bot_id: {bot_id}")
            return

        ctx = BotContext(user_id=user_id, bot_id=bot_id, config=config)
        self.live_bots[key] = bot_cls(ctx)

        upsert_runtime_state(sb, user_id, bot_id, runtime_state="running", last_started_at=now_iso())
        log_line(sb, user_id, bot_id, "info", f"Bot started by runner {RUNNER_ID}")

    def tick_bot(self, user_id: str, bot_id: str):
        sb = self.sb
        key = (user_id, bot_id)
        bot = self.live_bots.get(key)
        if not bot:
            return

        try:
            bot.tick(sb)
        except Exception as e:
            # Strategy error -> mark error and PAUSE desired_state automatically (safety)
            err_msg = f"{type(e).__name__}: {str(e)}"
            tb = traceback.format_exc(limit=6)

            upsert_runtime_state(
                sb,
                user_id,
                bot_id,
                runtime_state="error",
                last_error_type="strategy",
                last_error_message=err_msg,
            )
            log_line(sb, user_id, bot_id, "error", "Strategy error. Auto-pausing bot.", {"error": err_msg, "trace": tb})

            # Auto-pause desired_state on strategy failures (so it doesn't keep trying to trade)
            sb.table("bot_desired_state").upsert(
                {
                    "user_id": user_id,
                    "bot_id": bot_id,
                    "desired_state": "paused",
                    "updated_at": now_iso(),
                },
                on_conflict="user_id,bot_id",
            ).execute()

            # Keep bot object but it will stop ticking since desired_state is paused next poll.

    def heartbeat(self, user_id: str, bot_id: str, runtime_state: str):
        sb = self.sb
        upsert_runtime_state(sb, user_id, bot_id, runtime_state=runtime_state)

        # Heartbeat logs can get expensive; log once per HEARTBEAT_LOG_EVERY seconds per bot.
        key = (user_id, bot_id)
        now_t = time.time()
        last = self.last_heartbeat_log_at.get(key, 0.0)
        if now_t - last >= HEARTBEAT_LOG_EVERY:
            self.last_heartbeat_log_at[key] = now_t
            log_line(sb, user_id, bot_id, "info", f"heartbeat: {runtime_state}", {"runner_id": RUNNER_ID})


if __name__ == "__main__":
    Runner().run_forever()
pr(e))
            time.sleep(2)


if __name__ == "__main__":
    main()
