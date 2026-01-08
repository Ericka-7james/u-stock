from datetime import datetime, timedelta
import pytz

ET = pytz.timezone("America/New_York")


def now_et():
    return datetime.now(tz=ET)


def is_weekday(dt: datetime) -> bool:
    return dt.weekday() < 5


def within_market_hours(dt: datetime) -> bool:
    open_t = dt.replace(hour=9, minute=30, second=0, microsecond=0)
    close_t = dt.replace(hour=16, minute=0, second=0, microsecond=0)
    return is_weekday(dt) and (open_t <= dt <= close_t)


def parse_hhmm(hhmm: str):
    h, m = hhmm.split(":")
    return int(h), int(m)


class ORBBot:
    """
    ORB skeleton:
    - runner calls step() repeatedly while desired_state=running
    - bot only "does work" during market hours
    - logs key milestones
    """

    def __init__(self, sb, runner_id: str):
        self.sb = sb
        self.runner_id = runner_id
        self._stop = False
        self._last_range_log_date = None

    def request_stop(self):
        self._stop = True

    def log(self, user_id: str, level: str, msg: str, meta=None):
        self.sb.table("bot_logs").insert(
            {
                "user_id": user_id,
                "bot_id": "orb",
                "level": level,
                "message": msg,
                "meta": meta or {},
            }
        ).execute()

    def _symbols(self, cfg: dict):
        mode = cfg.get("symbols_mode", "static")
        if mode == "static":
            return list(cfg.get("symbols") or ["SPY"])
        # future: watchlist/top_n
        return list(cfg.get("symbols") or ["SPY"])

    def step(self, user_id: str, config: dict):
        if self._stop:
            return

        dt = now_et()

        # Market gating
        if not within_market_hours(dt):
            return

        range_minutes = int(config.get("range_minutes", 5))
        open_time = dt.replace(hour=9, minute=30, second=0, microsecond=0)
        range_end = open_time + timedelta(minutes=range_minutes)

        # entry cutoff time
        end_h, end_m = parse_hhmm(config.get("trade_end_time_et", "11:00"))
        cutoff = dt.replace(hour=end_h, minute=end_m, second=0, microsecond=0)

        symbols = self._symbols(config)

        # Log once per day when OR window ends (just to prove it’s alive)
        today = dt.date()
        if dt >= range_end and self._last_range_log_date != today:
            self._last_range_log_date = today
            self.log(
                user_id,
                "info",
                f"ORB window ended ({range_minutes}m). Symbols={symbols}. Next: compute range + wait for breakout.",
                {"range_minutes": range_minutes, "symbols": symbols},
            )

        # Past cutoff, no entries
        if dt > cutoff:
            return

        # Skeleton ends here; next step we add:
        # - candle fetching
        # - OR high/low
        # - VWAP filter
        # - bracket order placement
        return
