from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class SelectionConfig:
    # Primary sort key
    confidence_key: str = "confidence"
    # Secondary tie-breaker
    bias_score_key: str = "bias_score"


def _as_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return float(default)


def score_intent(intent: Dict[str, Any], cfg: SelectionConfig) -> Tuple[float, float]:
    """
    Returns (confidence, bias_score) used for deterministic ranking.
    """
    conf = _as_float(intent.get(cfg.confidence_key), 0.0)
    bias = _as_float(intent.get(cfg.bias_score_key), 0.0)
    return (conf, bias)


def pick_best_intent(
    intents: List[Dict[str, Any]],
    cfg: Optional[SelectionConfig] = None,
) -> Optional[Dict[str, Any]]:
    if not intents:
        return None
    cfg = cfg or SelectionConfig()

    # Deterministic: highest confidence, then highest bias_score
    best = max(intents, key=lambda it: score_intent(it, cfg))
    return best