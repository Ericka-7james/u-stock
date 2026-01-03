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
