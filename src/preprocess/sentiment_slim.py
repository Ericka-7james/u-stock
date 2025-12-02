# src/data_scout/preprocess/sentiment_slim.py

"""
Build a slim per-ticker sentiment snapshot from raw mentions.

Input (flexible, best guess):
  public/data/mentions-joined.json

Expected shapes this script handles:
  1) List of mention rows:
       [
         {"ticker": "AAPL", "sentiment": 0.42, "createdAt": "...", ...},
         ...
       ]

  2) Wrapper object with "rows":
       {
         "generatedAt": "...",
         "rows": [ { ... }, ... ]
       }

We aggregate by ticker and write:

  - Parquet: public/data/pandas/sentiment_slim.parquet
  - JSON:    public/data/fetched/sentiment-slim.json

JSON schema:

{
  "generatedAt": "...",
  "universe": ["AAPL", "MSFT", ...],
  "data": [
    {
      "ticker": "AAPL",
      "mentionCount": 42,
      "avgSentiment": 0.31,
      "posFraction": 0.7,
      "negFraction": 0.2,
      "lastMentionAt": "2025-11-30T23:59:12Z"
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd  # type: ignore


# ---------- path helpers -----------------------------------------------------


def get_project_root() -> Path:
  """
  Compute project root from this file location.

  This file lives at: src/data_scout/preprocess/sentiment_slim.py

  parents[0] -> preprocess
  parents[1] -> data_scout
  parents[2] -> src
  parents[3] -> project root
  """
  return Path(__file__).resolve().parents[3]


def raw_mentions_path() -> Path:
  # Keep the old name/path you had, just treated as "raw"
  return get_project_root() / "public" / "data" / "mentions-joined.json"


def sentiment_parquet_path() -> Path:
  return get_project_root() / "public" / "data" / "pandas" / "sentiment_slim.parquet"


def sentiment_json_path() -> Path:
  return get_project_root() / "public" / "data" / "fetched" / "sentiment-slim.json"


# ---------- load raw mentions -------------------------------------------------


def load_raw_mentions() -> pd.DataFrame:
  path = raw_mentions_path()
  if not path.exists():
    print(f"[sentiment_slim] No raw mentions file at {path}")
    return pd.DataFrame()

  try:
    with path.open("r", encoding="utf-8") as f:
      payload = json.load(f)
  except Exception as e:
    print(f"[sentiment_slim] ERROR reading mentions-joined.json: {e}")
    return pd.DataFrame()

  # Handle both shapes: list or {rows: [...]}
  if isinstance(payload, list):
    rows = payload
    generated_at = None
  elif isinstance(payload, dict):
    rows = payload.get("rows", [])
    generated_at = payload.get("generatedAt") or payload.get("generated_at")
  else:
    print("[sentiment_slim] Unexpected JSON top-level type")
    return pd.DataFrame()

  if not isinstance(rows, list):
    print("[sentiment_slim] 'rows' is not a list")
    return pd.DataFrame()

  df = pd.DataFrame(rows)

  if df.empty:
    print("[sentiment_slim] No rows to process")
    return df

  # Normalize column names we care about
  # Try a few common variants for sentiment + created time.
  if "sentiment" not in df.columns:
    # Maybe it's "score" or "compound" etc.
    for candidate in ["score", "compound", "sentiment_score"]:
      if candidate in df.columns:
        df["sentiment"] = df[candidate]
        break

  # created timestamp
  if "createdAt" not in df.columns:
    for candidate in ["created_at", "created_utc", "timestamp"]:
      if candidate in df.columns:
        df["createdAt"] = df[candidate]
        break

  if "ticker" not in df.columns:
    print("[sentiment_slim] No 'ticker' column; nothing to aggregate.")
    return pd.DataFrame()

  # Basic cleaning
  df = df[df["ticker"].notna()].copy()
  df["ticker"] = df["ticker"].astype(str).str.upper().str.strip()

  if "sentiment" in df.columns:
    df["sentiment"] = pd.to_numeric(df["sentiment"], errors="coerce")
  else:
    df["sentiment"] = pd.NA

  if "createdAt" in df.columns:
    df["createdAt"] = pd.to_datetime(df["createdAt"], errors="coerce", utc=True)
  else:
    df["createdAt"] = pd.NaT

  return df


# ---------- build slim per-ticker snapshot -----------------------------------


def build_sentiment_slim(df: pd.DataFrame) -> pd.DataFrame:
  if df.empty:
    return pd.DataFrame(
      columns=[
        "ticker",
        "mentionCount",
        "avgSentiment",
        "posFraction",
        "negFraction",
        "lastMentionAt",
      ]
    )

  # Define boolean masks only where sentiment is a real number
  valid = df["sentiment"].notna()
  pos = valid & (df["sentiment"] > 0)
  neg = valid & (df["sentiment"] < 0)

  # Group by ticker
  grouped = df.groupby("ticker", dropna=True)

  out = grouped.agg(
    mentionCount=("ticker", "size"),
    avgSentiment=("sentiment", "mean"),
    posCount=(pos.name, lambda x: (x & valid.loc[x.index]).sum() if len(x) else 0),
    negCount=(neg.name, lambda x: (x & valid.loc[x.index]).sum() if len(x) else 0),
    lastMentionAt=("createdAt", "max"),
  ).reset_index()

  # Compute fractions safely
  out["avgSentiment"] = out["avgSentiment"].fillna(0.0)
  out["posFraction"] = out.apply(
    lambda row: row["posCount"] / row["mentionCount"] if row["mentionCount"] else 0.0,
    axis=1,
  )
  out["negFraction"] = out.apply(
    lambda row: row["negCount"] / row["mentionCount"] if row["mentionCount"] else 0.0,
    axis=1,
  )

  # Convert timestamps to ISO strings
  out["lastMentionAt"] = out["lastMentionAt"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

  # Drop helper columns
  out = out[
    [
      "ticker",
      "mentionCount",
      "avgSentiment",
      "posFraction",
      "negFraction",
      "lastMentionAt",
    ]
  ]

  # Sort for a stable order
  out = out.sort_values("ticker").reset_index(drop=True)
  return out


# ---------- save helpers ------------------------------------------------------


def save_parquet(df: pd.DataFrame) -> Path:
  path = sentiment_parquet_path()
  path.parent.mkdir(parents=True, exist_ok=True)
  df.to_parquet(path, index=False)
  print(f"[sentiment_slim] Saved parquet to {path}")
  return path


def save_json(df: pd.DataFrame) -> Path:
  path = sentiment_json_path()
  path.parent.mkdir(parents=True, exist_ok=True)

  if df.empty:
    payload: Dict[str, Any] = {
      "generatedAt": datetime.now(timezone.utc).isoformat(),
      "universe": [],
      "data": [],
    }
  else:
    records: List[Dict[str, Any]] = df.to_dict(orient="records")
    universe = df["ticker"].tolist()
    payload = {
      "generatedAt": datetime.now(timezone.utc).isoformat(),
      "universe": universe,
      "data": records,
    }

  with path.open("w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)

  print(f"[sentiment_slim] Saved JSON to {path}")
  return path


# ---------- main entrypoint ---------------------------------------------------


def main() -> None:
  print("[sentiment_slim] Building per-ticker sentiment snapshot…", flush=True)

  df_raw = load_raw_mentions()
  print(f"[sentiment_slim] Loaded {len(df_raw)} raw mention rows.")

  df_slim = build_sentiment_slim(df_raw)
  print(
    f"[sentiment_slim] Slim snapshot: {len(df_slim)} tickers "
    f"with aggregated sentiment."
  )

  if df_slim.empty:
    print("[sentiment_slim] Nothing to save (empty snapshot).")
    return

  save_parquet(df_slim)
  save_json(df_slim)


if __name__ == "__main__":
  main()
