from dataclasses import dataclass
from typing import Optional, Protocol
from bots._shared.types import TradeIntent

@dataclass
class OrderResult:
    status: str
    order_id: Optional[str] = None
    message: Optional[str] = None

class Executor(Protocol):
    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        ...
