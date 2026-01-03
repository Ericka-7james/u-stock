# data_scout/data_layer/providers/base.py
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, Iterable, List, Sequence, Tuple
import os

from data_scout.data_layer.types import Candle, PriceInterval


class PriceDataProvider(ABC):
    """
    Abstract interface for any market data provider (Yahoo, Alpaca, Polygon, ...).

    All providers must return normalized Candle objects using UTC timestamps
    and accept a PriceInterval.
    """

    @abstractmethod
    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        """Fetch historical candles for one or more symbols."""
        raise NotImplementedError

    @abstractmethod
    def fetch_latest(
        self,
        symbols: Iterable[str],
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        """
        Fetch the most recent candle(s) for one or more symbols.

        Simplest version can just call fetch_history(...) and return
        the last bar per symbol.
        """
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Composite provider: combine multiple real providers (Alpaca / Polygon / Yahoo / Webull…)
# ---------------------------------------------------------------------------


def _dedupe_candles(candles: List[Candle]) -> List[Candle]:
    """
    Merge candles from multiple providers.

    - Keyed by (symbol, timestamp)
    - Last provider wins if there are duplicates.
    """
    merged: Dict[Tuple[str, datetime], Candle] = {}
    for c in candles:
        key = (c["symbol"], c["timestamp"])
        merged[key] = c
    return list(merged.values())


class CompositePriceDataProvider(PriceDataProvider):
    """
    Wraps multiple concrete providers and merges their results.

    Typical usage:
        CompositePriceDataProvider([
            AlpacaPriceDataProvider(...),
            PolygonPriceDataProvider(...),
            YahooPriceDataProvider(),
        ])

    - fetch_history: concatenates + de-duplicates by (symbol, timestamp)
    - fetch_latest: picks the newest bar per symbol across providers
    """

    def __init__(self, providers: Sequence[PriceDataProvider]) -> None:
        self.providers: List[PriceDataProvider] = list(providers)

    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        all_candles: List[Candle] = []

        for provider in self.providers:
            try:
                candles = provider.fetch_history(
                    symbols=symbols,
                    start=start,
                    end=end,
                    interval=interval,
                )
                if candles:
                    all_candles.extend(candles)
            except Exception as e:
                # Don't bring down the whole pipeline if one provider fails.
                print(
                    f"[data-layer] {provider.__class__.__name__}.fetch_history "
                    f"failed: {e}"
                )

        if not all_candles:
            return []

        return _dedupe_candles(all_candles)

    def fetch_latest(
        self,
        symbols: Iterable[str],
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        """
        Ask each provider for latest bars and pick the most recent
        bar per symbol across all providers.
        """
        latest_by_symbol: Dict[str, Candle] = {}

        for provider in self.providers:
            try:
                candles = provider.fetch_latest(symbols=symbols, interval=interval)
            except Exception as e:
                print(
                    f"[data-layer] {provider.__class__.__name__}.fetch_latest "
                    f"failed: {e}"
                )
                continue

            for c in candles:
                sym = c["symbol"]
                prev = latest_by_symbol.get(sym)
                if prev is None or c["timestamp"] > prev["timestamp"]:
                    latest_by_symbol[sym] = c

        return list(latest_by_symbol.values())


# ---------------------------------------------------------------------------
# Default provider builder (Alpaca + Polygon + Yahoo + hook for Webull)
# ---------------------------------------------------------------------------


def build_default_price_provider_from_env() -> PriceDataProvider:
    """
    Build a "smart" default provider from environment variables.

    Priority / composition:
      1. Alpaca (if ALPACA_API_KEY + ALPACA_API_SECRET set)
      2. Polygon (if POLYGON_API_KEY set)
      3. (Optionally) Webull (if you implement a WebullPriceDataProvider)
      4. Yahoo (always added as final fallback)

    If only one provider is available, that provider is returned directly.
    If multiple are available, a CompositePriceDataProvider is returned.
    """
    providers: List[PriceDataProvider] = []

    # --- Alpaca -------------------------------------------------------------
    alpaca_key = os.getenv("ALPACA_API_KEY")
    alpaca_secret = os.getenv("ALPACA_API_SECRET")
    if alpaca_key and alpaca_secret:
        try:
            from data_scout.data_layer.providers.alpaca_provider import (
                AlpacaPriceDataProvider,
            )

            providers.append(AlpacaPriceDataProvider(api_key=alpaca_key, api_secret=alpaca_secret))
            print("[data-layer] Using AlpacaPriceDataProvider")
        except Exception as e:
            print(f"[data-layer] Failed to init AlpacaPriceDataProvider: {e}")

    # --- Polygon.io ---------------------------------------------------------
    polygon_key = os.getenv("POLYGON_API_KEY")
    if polygon_key:
        try:
            from data_scout.data_layer.providers.polygon_provider import (
                PolygonPriceDataProvider,
            )

            providers.append(PolygonPriceDataProvider(api_key=polygon_key))
            print("[data-layer] Using PolygonPriceDataProvider")
        except Exception as e:
            print(f"[data-layer] Failed to init PolygonPriceDataProvider: {e}")

    # --- Webull (hook only; you implement the real provider) ---------------
    # For Webull, you'll typically need to follow their official tooling / SDK
    # and respect their Terms of Service.
    #
    # Once you've written a WebullPriceDataProvider(PriceDataProvider),
    # you can enable it here, for example:
    #
    # if os.getenv("WEBULL_ENABLED") == "1":
    #     from data_scout.data_layer.providers.webull_provider import (
    #         WebullPriceDataProvider,
    #     )
    #     providers.append(WebullPriceDataProvider(...))
    #     print("[data-layer] Using WebullPriceDataProvider")
    #
    # (Leaving this as a hook so we don't ship any unofficial / ToS-iffy code.)

    # --- Yahoo fallback (always included) -----------------------------------
    try:
        from data_scout.data_layer.providers.yahoo_provider import (
            YahooPriceDataProvider,
        )

        providers.append(YahooPriceDataProvider())
        print("[data-layer] Using YahooPriceDataProvider as fallback")
    except Exception as e:
        raise RuntimeError(f"[data-layer] Could not initialize YahooPriceDataProvider: {e}")

    if len(providers) == 1:
        return providers[0]

    return CompositePriceDataProvider(providers)
