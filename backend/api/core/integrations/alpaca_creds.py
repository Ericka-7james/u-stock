from __future__ import annotations

from typing import Tuple

from fastapi import HTTPException, Request, Response


def get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Shared credential helper.
    Keeps compatibility with your existing top_tickers logic by delegating once.

    Expected return: (user_id, api_key, api_secret, mode)
    """
    try:
        from api.routes.top_tickers import _get_user_alpaca_creds as _creds
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Missing Alpaca credential helper: {repr(e)}")

    return _creds(request, response)
