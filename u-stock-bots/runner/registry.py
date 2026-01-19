# u-stock-bots/runner/registry.py
from __future__ import annotations

from typing import Callable, Dict, Any

BotFn = Callable[[Any, Dict[str, Any]], Dict[str, Any]]

REGISTRY: Dict[str, BotFn] = {}


def register(bot_id: str, fn: BotFn) -> None:
    REGISTRY[str(bot_id).strip().lower()] = fn


def get(bot_id: str) -> BotFn:
    key = str(bot_id).strip().lower()
    if key not in REGISTRY:
        raise KeyError(f"Bot '{bot_id}' is not registered")
    return REGISTRY[key]
