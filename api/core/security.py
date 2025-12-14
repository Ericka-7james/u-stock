# api/core/security.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request
import jwt

from api.core.config import settings


def create_access_token(user_id: int) -> str:
  exp = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXP_MINUTES)
  payload = {"sub": str(user_id), "exp": exp}
  return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def get_current_user_id_from_cookie(request: Request) -> int:
  token = request.cookies.get(settings.COOKIE_NAME)
  if not token:
    raise HTTPException(status_code=401, detail="Not authenticated")

  try:
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    return int(payload["sub"])
  except jwt.ExpiredSignatureError:
    raise HTTPException(status_code=401, detail="Session expired")
  except Exception:
    raise HTTPException(status_code=401, detail="Invalid session")
