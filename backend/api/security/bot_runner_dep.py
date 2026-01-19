# api/security/bot_runner_dep.py
from __future__ import annotations

from fastapi import Header, HTTPException
import jwt

from api.security.bot_runner_token import load_bot_runner_config, verify_bot_runner_token


def require_bot_runner(authorization: str = Header(default="")) -> str:
    """
    FastAPI dependency:
      - Validates Authorization: Bearer <token>
      - Returns user_id (payload['sub'])
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        cfg = load_bot_runner_config()
        payload = verify_bot_runner_token(token, cfg)

        user_id = str(payload.get("sub") or "").strip()
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token subject")

        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Bot runner token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid bot runner token: {str(e)}")
    except HTTPException:
        raise
    except Exception:
        # Fail closed for any unexpected verification/config errors
        raise HTTPException(status_code=401, detail="Invalid bot runner token")
