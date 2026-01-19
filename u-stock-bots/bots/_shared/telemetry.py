from __future__ import annotations

from typing import Dict


def inc(counters: Dict[str, int], key: str, n: int = 1) -> None:
    counters[key] = int(counters.get(key, 0)) + int(n)


def one_line(prefix: str, counters: Dict[str, int]) -> str:
    parts = [f"{k}={counters[k]}" for k in sorted(counters.keys())]
    return f"[{prefix}] " + " ".join(parts)
