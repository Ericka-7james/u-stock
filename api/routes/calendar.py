# api/routes/calendar.py
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

@router.get("/no-trade-windows")
def no_trade_windows():
    try:
        with open("api/data/no_trade_events.json", "r", encoding="utf-8") as f:
            cfg = json.load(f)

        tz = ZoneInfo(cfg.get("timezone", "America/New_York"))
        windows = []

        for e in cfg.get("events", []):
            dt = datetime.fromisoformat(f"{e['date']}T{e['time']}:00").replace(tzinfo=tz)
            buf = int(e.get("buffer_min", 30))
            windows.append({
                "name": e["name"],
                "start": (dt - timedelta(minutes=buf)).isoformat(),
                "event": dt.isoformat(),
                "end": (dt + timedelta(minutes=buf)).isoformat(),
            })

        return {"ok": True, "source": "local_json", "windows": windows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"calendar_failed: {repr(e)}")

@router.get("/no-trade-windows/fmp")
def no_trade_windows_fmp(from_date: str, to_date: str, buffer_min: int = 30):
    """
    Returns economic events in range, converted to no-trade windows.
    """
    try:
        raw = fmp_economic_calendar(from_date, to_date)["data"]
        windows = []
        for e in raw:
            # FMP commonly returns a "date" field; exact fields can vary
            dt_str = e.get("date")
            name = e.get("event") or e.get("name") or "Economic Event"
            if not dt_str:
                continue

            # If dt_str is "YYYY-MM-DD HH:MM:SS" assume ET; treat as naive
            dt = datetime.fromisoformat(dt_str.replace("Z","").replace(" ", "T"))
            windows.append({
                "name": name,
                "start": (dt - timedelta(minutes=buffer_min)).isoformat(),
                "event": dt.isoformat(),
                "end": (dt + timedelta(minutes=buffer_min)).isoformat(),
                "meta": {"source": "fmp", "raw": e},
            })
        return {"ok": True, "source": "fmp", "windows": windows}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"calendar_fmp_failed: {repr(e)}")
