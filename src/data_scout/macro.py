from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "macro.json"

FRED_API_BASE = "https://api.stlouisfed.org/fred"

# Default series to pull – you can tweak or expand this list.
DEFAULT_SERIES = [
    {"id": "CPIAUCSL", "label": "CPI (All Items)"},
    {"id": "UNRATE", "label": "Unemployment Rate"},
    {"id": "GDPC1", "label": "Real GDP (Chained 2017 Dollars)"},
    {"id": "DFF", "label": "Effective Federal Funds Rate"},
    {"id": "M2SL", "label": "M2 Money Stock"},
]


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def fetch_latest_fred_observation(series_id: str, api_key: str) -> Dict[str, Any] | None:
    url = f"{FRED_API_BASE}/series/observations"
    params = {
        "series_id": series_id,
        "sort_order": "desc",
        "limit": 1,
        "api_key": api_key,
        "file_type": "json",
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        payload = resp.json()
        observations = payload.get("observations", [])
        if not observations:
            return None

        obs = observations[0]
        value_str = obs.get("value", "nan")
        try:
            value = float(value_str)
        except ValueError:
            value = None

        return {
            "date": obs.get("date"),
            "value": value,
        }
    except Exception as exc:  # noqa: BLE001
        print(f"[macro] Failed to fetch observations for {series_id}: {exc}")
        return None


def fetch_series_metadata(series_id: str, api_key: str) -> Dict[str, Any] | None:
    url = f"{FRED_API_BASE}/series"
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        payload = resp.json()
        series_list = payload.get("seriess", [])
        if not series_list:
            return None
        return series_list[0]
    except Exception as exc:  # noqa: BLE001
        print(f"[macro] Failed to fetch metadata for {series_id}: {exc}")
        return None


def fetch_macro_snapshot() -> Dict[str, Any]:
    """
    Build a snapshot of default macro series using FRED.

    Env (from .env.local):

        VITE_FRED_API_KEY=your_real_key
    """
    api_key = os.getenv("VITE_FRED_API_KEY")
    if not api_key:
        print("[macro] WARNING: VITE_FRED_API_KEY not set. Macro snapshot will be empty.")
        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "series": [],
            "error": "VITE_FRED_API_KEY not set",
        }

    series_results: List[Dict[str, Any]] = []

    for entry in DEFAULT_SERIES:
        series_id = entry["id"]
        label = entry.get("label", series_id)
        print(f"[macro] Fetching {series_id} …")

        meta = fetch_series_metadata(series_id, api_key) or {}
        obs = fetch_latest_fred_observation(series_id, api_key)

        series_payload: Dict[str, Any] = {
            "id": series_id,
            "label": label,
            "latest": obs["value"] if obs else None,
            "lastUpdated": obs["date"] if obs else None,
            "units": meta.get("units"),
            "frequency": meta.get("frequency"),
            "source": meta.get("source"),
        }
        series_results.append(series_payload)

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "series": series_results,
    }


def write_snapshot(snapshot: Dict[str, Any], output_file: Path = DEFAULT_OUTPUT_FILE) -> None:
    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)


def main() -> None:
    """
    CLI entry point.

        VITE_FRED_API_KEY=... PYTHONPATH=src python -m data_scout.macro
    """
    snapshot = fetch_macro_snapshot()
    write_snapshot(snapshot)
    print(f"[macro] Wrote macro snapshot with {len(snapshot.get('series', []))} series → {DEFAULT_OUTPUT_FILE}")


if __name__ == "__main__":
    main()
