from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from api.deps import require_user
from api.security.bot_runner_dep import require_bot_runner

from api.core.integrations.alpaca_models import AlpacaCredsOut, AlpacaKeysIn, AlpacaKeysOut, normalize_mode
from api.core.integrations.alpaca_repo import AlpacaIntegrationRepo

router = APIRouter(prefix="/integrations/alpaca", tags=["integrations-alpaca"])


@router.post("/keys", response_model=AlpacaKeysOut)
def save_alpaca_keys(body: AlpacaKeysIn, request: Request, response: Response):
    """
    UI saves Alpaca keys for signed-in user (cookie auth).
    POST /api/integrations/alpaca/keys
    """
    u = require_user(request, response)
    user_id = u["id"]

    repo = AlpacaIntegrationRepo()
    mode = repo.upsert_keys(
        user_id=user_id,
        api_key=body.api_key,
        api_secret=body.api_secret,
        mode=normalize_mode(body.mode),
    )

    return AlpacaKeysOut(ok=True, provider="alpaca", status="connected", mode=mode)


@router.get("/creds", response_model=AlpacaCredsOut)
def get_alpaca_creds(user_id: str = Depends(require_bot_runner)):
    """
    Bot runner fetches keys for a specific user via runner token auth.
    GET /api/integrations/alpaca/creds
    """
    repo = AlpacaIntegrationRepo()
    status, mode, api_key, api_secret = repo.get_creds_if_connected(user_id=user_id)

    return AlpacaCredsOut(
        ok=True,
        status=status,
        mode=mode,
        api_key=api_key,
        api_secret=api_secret,
    )
