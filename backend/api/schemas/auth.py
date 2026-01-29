from __future__ import annotations

import re
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, EmailStr

from api.core.config import get_settings


class SignupBody(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None
    avatar: Optional[str] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    avatar: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserOut
    ok: bool = True


def validate_password(password: str, email: str, username: str | None = None) -> None:
    policy = get_settings().password_policy

    if len(password) < policy.min_len:
        raise HTTPException(status_code=400, detail=f"Password must be at least {policy.min_len} characters.")
    if policy.require_upper and not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 uppercase letter.")
    if policy.require_lower and not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 lowercase letter.")
    if policy.require_digit and not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 number.")
    if policy.require_special and not re.search(r"[^\w\s]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 special character.")

    if policy.forbid_email_local_part:
        email_local = email.split("@")[0].lower()
        if email_local and email_local in password.lower():
            raise HTTPException(status_code=400, detail="Password must not contain your email.")

    if policy.forbid_username and username and username.lower() in password.lower():
        raise HTTPException(status_code=400, detail="Password must not contain your username.")
