# backend/api/routes/calendar.py
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore
    ZoneInfoNotFoundError = Exception  # type: ignore

# Import your FMP function if it exists in your codebase.
# If the real location differs, adjust this import.
# We keep it importable so it can be monkeypatched in tests.
try:
    from api.clients.fmp_client import fmp_economic_calendar  # type: ignore
except Exception:  # pragma: no cover
    fmp_economic_calendar = None  # will be checked at runtime

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

_NO_TRADE_JSON_PATH = Path(__file__).resolve().parents[1] / "data" / "no_trade_events.json"

# Safety clamps
_MAX_WINDOW_RESULTS = 5000
_MAX_BUFFER_MIN = 240  # 4 hours


# -------------------------
# Models
# -------------------------
class NoTradeWindowsOut(BaseModel):
    ok: bool = True
    source: str
    tz: str
    windows: List[Dict[str, Any]]


class CalendarCustomRangeOut(BaseModel):
    ok: bool = True
    tz: str
    start: str
    end: str
    no_trade_windows: List[Dict[str, Any]]


# -------------------------
# Helpers
# -------------------------
def _safe_tz(name: str):
    """
    Return a tzinfo. Prefer IANA zoneinfo; fall back to UTC if unavailable.
    This prevents Windows envs (missing tz database) from crashing endpoints.
    """
    name = (name or "").strip() or "UTC"
    if ZoneInfo is not None:
        try:
            return ZoneInfo(name)
        except ZoneInfoNotFoundError:
            pass
        except Exception:
            pass
    return timezone.utc


def _clamp_int(x: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(x)))


def _parse_iso_date(s: str) -> date:
    try:
        return date.fromisoformat(str(s))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")


def _parse_iso_dt(s: str, tz) -> datetime:
    """
    Accept:
      - YYYY-MM-DD
      - YYYY-MM-DDTHH:MM
      - YYYY-MM-DDTHH:MM:SS
      - optional trailing Z
    If datetime is naive, assume tz.
    """
    raw = str(s).strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Missing datetime")

    # Date-only => midnight in tz
    if len(raw) == 10 and raw.count("-") == 2:
        d = _parse_iso_date(raw)
        return datetime(d.year, d.month, d.day, tzinfo=tz)

    try:
        dt = datetime.fromisoformat(raw.replace("Z", "").replace(" ", "T"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO 8601.")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)

    return dt


def _load_local_no_trade_windows(
    tz,
    *,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """
    Reads local JSON config. Optionally filters to only windows that intersect [start, end].
    """
    if not _NO_TRADE_JSON_PATH.exists():
        return []

    with _NO_TRADE_JSON_PATH.open("r", encoding="utf-8") as f:
        cfg = json.load(f)

    events = cfg.get("events", []) or []
    out: List[Dict[str, Any]] = []

    for e in events:
        name = str(e.get("name") or "").strip() or "Event"
        d = str(e.get("date") or "").strip()
        t = str(e.get("time") or "").strip()
        if not d or not t:
            continue

        try:
            dt = datetime.fromisoformat(f"{d}T{t}:00").replace(tzinfo=tz)
        except Exception:
            continue

        buf = _clamp_int(int(e.get("buffer_min", 30)), 0, _MAX_BUFFER_MIN)
        w_start = dt - timedelta(minutes=buf)
        w_end = dt + timedelta(minutes=buf)

        # Filter by intersection if requested
        if start is not None and w_end < start:
            continue
        if end is not None and w_start > end:
            continue

        out.append(
            {
                "name": name,
                "start": w_start.isoformat(),
                "event": dt.isoformat(),
                "end": w_end.isoformat(),
                "meta": {"source": "local_json"},
            }
        )
        if len(out) >= _MAX_WINDOW_RESULTS:
            break

    return out


def _load_fmp_no_trade_windows(
    tz,
    *,
    from_date: str,
    to_date: str,
    buffer_min: int,
) -> List[Dict[str, Any]]:
    """
    Loads economic events via FMP and returns windows.
    """
    if fmp_economic_calendar is None:
        return []

    buf = _clamp_int(buffer_min, 0, _MAX_BUFFER_MIN)

    res = fmp_economic_calendar(from_date, to_date) or {}
    raw = res.get("data") or []
    out: List[Dict[str, Any]] = []

    for e in raw:
        dt_str = e.get("date")
        name = e.get("event") or e.get("name") or "Economic Event"
        if not dt_str:
            continue

        try:
            dt = datetime.fromisoformat(str(dt_str).replace("Z", "").replace(" ", "T"))
        except Exception:
            continue

        # If FMP provides naive timestamps, assume tz (NY) so UI lines up.
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)

        w_start = dt - timedelta(minutes=buf)
        w_end = dt + timedelta(minutes=buf)

        out.append(
            {
                "name": str(name),
                "start": w_start.isoformat(),
                "event": dt.isoformat(),
                "end": w_end.isoformat(),
                "meta": {"source": "fmp", "raw": e},
            }
        )
        if len(out) >= _MAX_WINDOW_RESULTS:
            break

    return out


def _merge_windows(*parts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Merge and sort by start time (ISO strings sort correctly).
    """
    merged: List[Dict[str, Any]] = []
    for p in parts:
        merged.extend(p or [])

    merged.sort(key=lambda w: str(w.get("start") or ""))
    return merged[:_MAX_WINDOW_RESULTS]


# -------------------------
# Endpoints
# -------------------------
@router.get("/no-trade-windows", response_model=NoTradeWindowsOut)
def no_trade_windows(
    tz: str = Query("America/New_York"),
    start: Optional[str] = Query(default=None, description="ISO datetime or YYYY-MM-DD"),
    end: Optional[str] = Query(default=None, description="ISO datetime or YYYY-MM-DD"),
):
    """
    Local JSON no-trade windows (optionally filtered by start/end).
    """
    try:
        tzinfo = _safe_tz(tz)
        dt_start = _parse_iso_dt(start, tzinfo) if start else None
        dt_end = _parse_iso_dt(end, tzinfo) if end else None

        windows = _load_local_no_trade_windows(tzinfo, start=dt_start, end=dt_end)
        return {"ok": True, "source": "local_json", "tz": tz, "windows": windows}
    except HTTPException:
        raise
    except Exception:
        # don't leak internal errors to clients
        raise HTTPException(status_code=500, detail="calendar_failed")


@router.get("/no-trade-windows/fmp", response_model=NoTradeWindowsOut)
def no_trade_windows_fmp(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    buffer_min: int = Query(30, ge=0, le=_MAX_BUFFER_MIN),
    tz: str = Query("America/New_York"),
):
    """
    Returns economic events in range (FMP), converted to no-trade windows.
    """
    try:
        if fmp_economic_calendar is None:
            raise HTTPException(status_code=501, detail="FMP calendar is not configured")

        tzinfo = _safe_tz(tz)
        windows = _load_fmp_no_trade_windows(tzinfo, from_date=from_date, to_date=to_date, buffer_min=buffer_min)
        return {"ok": True, "source": "fmp", "tz": tz, "windows": windows}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="calendar_fmp_failed")


@router.get("/range/custom", response_model=CalendarCustomRangeOut)
def calendar_custom_range(
    start: str = Query(..., description="ISO datetime or YYYY-MM-DD"),
    end: str = Query(..., description="ISO datetime or YYYY-MM-DD"),
    tz: str = Query("America/New_York"),
    include_fmp: bool = Query(False, description="Include FMP windows if available"),
    buffer_min: int = Query(30, ge=0, le=_MAX_BUFFER_MIN),
):
    """
    Custom range for date pickers (typed or selected).

    Returns:
      - normalized start/end ISO datetimes in tz (minute precision)
      - merged no-trade windows intersecting [start, end]
    """
    tzinfo = _safe_tz(tz)

    dt_start = _parse_iso_dt(start, tzinfo)
    dt_end = _parse_iso_dt(end, tzinfo)

    if dt_end < dt_start:
        raise HTTPException(status_code=400, detail="end must be >= start")

    # Normalize to minute precision to keep UI stable
    dt_start = dt_start.replace(second=0, microsecond=0)
    dt_end = dt_end.replace(second=0, microsecond=0)

    local = _load_local_no_trade_windows(tzinfo, start=dt_start, end=dt_end)

    fmp: List[Dict[str, Any]] = []
    if include_fmp and fmp_economic_calendar is not None:
        from_date = dt_start.date().isoformat()
        to_date = dt_end.date().isoformat()

        raw_fmp = _load_fmp_no_trade_windows(tzinfo, from_date=from_date, to_date=to_date, buffer_min=buffer_min)

        # Keep only those intersecting [start, end]
        filtered: List[Dict[str, Any]] = []
        for w in raw_fmp:
            try:
                ws = _parse_iso_dt(w.get("start", ""), tzinfo)
                we = _parse_iso_dt(w.get("end", ""), tzinfo)
            except Exception:
                continue
            if we < dt_start:
                continue
            if ws > dt_end:
                continue
            filtered.append(w)

        fmp = filtered

    merged = _merge_windows(local, fmp)

    return {
        "ok": True,
        "tz": tz,
        "start": dt_start.isoformat(),
        "end": dt_end.isoformat(),
        "no_trade_windows": merged,
    }
