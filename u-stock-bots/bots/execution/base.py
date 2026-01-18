from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from bots._shared.types import TradeIntent


@dataclass(frozen=True)
class OrderResult:
    """
    Standardized result from an execution attempt.

    status:
      - submitted
      - rejected
      - error
      - not_implemented
    """
    status: str
    order_id: Optional[str] = None
    message: Optional[str] = None


class Executor(Protocol):
    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        ...
