# api/routes/calendar.py
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException

# Import your FMP function if it exists in your codebase.
# If the real location differs, adjust this import.
# We keep it importable so it can be monkeypatched in tests.
try:
    from api.clients.fmp_client import fmp_economic_calendar  # type: ignore
except Exception:  # pragma: no cover
    fmp_economic_calendar = None  # will be checked at runtime

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

_NO_TRADE_JSON_PATH = Path(__file__).resolve().parents[1] / "data" / "no_trade_events.json"


@router.get("/no-trade-windows")
def no_trade_windows():
    try:
        with _NO_TRADE_JSON_PATH.open("r", encoding="utf-8") as f:
            cfg = json.load(f)

        tz = ZoneInfo(cfg.get("timezone", "America/New_York"))
        windows = []

        for e in cfg.get("events", []):
            dt = datetime.fromisoformat(f"{e['date']}T{e['time']}:00").replace(tzinfo=tz)
            buf = int(e.get("buffer_min", 30))
            windows.append(
                {
                    "name": e["name"],
                    "start": (dt - timedelta(minutes=buf)).isoformat(),
                    "event": dt.isoformat(),
                    "end": (dt + timedelta(minutes=buf)).isoformat(),
                }
            )

        return {"ok": True, "source": "local_json", "windows": windows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"calendar_failed: {repr(e)}")


@router.get("/no-trade-windows/fmp")
def no_trade_windows_fmp(from_date: str, to_date: str, buffer_min: int = 30):
    """
    Returns economic events in range, converted to no-trade windows.
    """
    try:
        if fmp_economic_calendar is None:
            raise RuntimeError("fmp_economic_calendar is not configured/importable")

        raw = fmp_economic_calendar(from_date, to_date)["data"]
        windows = []

        for e in raw:
            dt_str = e.get("date")
            name = e.get("event") or e.get("name") or "Economic Event"
            if not dt_str:
                continue

            # Normalize common formats:
            # - "YYYY-MM-DD HH:MM:SS"
            # - ISO with "Z"
            dt = datetime.fromisoformat(dt_str.replace("Z", "").replace(" ", "T"))

            windows.append(
                {
                    "name": name,
                    "start": (dt - timedelta(minutes=buffer_min)).isoformat(),
                    "event": dt.isoformat(),
                    "end": (dt + timedelta(minutes=buffer_min)).isoformat(),
                    "meta": {"source": "fmp", "raw": e},
                }
            )

        return {"ok": True, "source": "fmp", "windows": windows}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"calendar_fmp_failed: {repr(e)}")
