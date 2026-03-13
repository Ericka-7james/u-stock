from __future__ import annotations

"""Error types and helpers for bot service operations."""

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class BotServiceError(Exception):
    """Structured bot service exception.

    Attributes:
        op_name: Logical operation name.
        public_detail: Safe user-facing detail message.
        internal_detail: Optional internal debugging detail.
    """

    op_name: str
    public_detail: str
    internal_detail: str = ""

    def __str__(self) -> str:
        """Returns a readable exception string."""
        if self.internal_detail:
            return f"{self.op_name}: {self.public_detail} | {self.internal_detail}"
        return f"{self.op_name}: {self.public_detail}"


def failure_response(*, bot_id: str, detail: str, code: Optional[str] = None) -> Dict[str, Any]:
    """Builds a standard failure response payload.

    Args:
        bot_id: Bot identifier.
        detail: User-facing error detail.
        code: Optional machine-readable error code.

    Returns:
        API response dictionary.
    """
    out: Dict[str, Any] = {
        "ok": False,
        "bot_id": str(bot_id or "").strip(),
        "detail": str(detail or "").strip() or "Operation failed",
    }
    if code:
        out["code"] = str(code).strip()
    return out