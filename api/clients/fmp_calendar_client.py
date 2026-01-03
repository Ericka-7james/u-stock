# api/clients/fmp_calendar_client.py
import os, requests
from typing import Dict, Any

FMP_API_KEY = os.getenv("FMP_API_KEY", "").strip()
FMP_BASE = "https://financialmodelingprep.com/api/v3"

def fmp_economic_calendar(from_date: str, to_date: str) -> Dict[str, Any]:
    if not FMP_API_KEY:
        raise RuntimeError("FMP_API_KEY missing")

    url = f"{FMP_BASE}/economic_calendar"
    params = {"from": from_date, "to": to_date, "apikey": FMP_API_KEY}
    r = requests.get(url, params=params, timeout=12)
    r.raise_for_status()
    return {"data": r.json()}
