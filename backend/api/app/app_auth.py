from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from api.app.app_bootstrap import cookie_cfg
from api.db import get_supabase_anon
from api.deps import require_user


PASSWORD_MIN_LEN = 12


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
    if len(password) < PASSWORD_MIN_LEN:
        raise HTTPException(status_code=400, detail=f"Password must be at least {PASSWORD_MIN_LEN} characters.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 lowercase letter.")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 number.")
    if not re.search(r"[^\w\s]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 special character.")

    email_local = email.split("@")[0].lower()
    if email_local and email_local in password.lower():
        raise HTTPException(status_code=400, detail="Password must not contain your email.")
    if username and username.lower() in password.lower():
        raise HTTPException(status_code=400, detail="Password must not contain your username.")


def set_auth_cookies(response: Response, access_token: str, refresh_token: str | None = None) -> None:
    cookie_name, refresh_cookie_name, cookie_secure, cookie_samesite, cookie_max_age = cookie_cfg()

    if access_token:
        response.set_cookie(
            key=cookie_name,
            value=access_token,
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=cookie_max_age,
            path="/",
        )
    if refresh_token:
        response.set_cookie(
            key=refresh_cookie_name,
            value=refresh_token,
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=cookie_max_age,
            path="/",
        )


def clear_auth_cookies(response: Response) -> None:
    cookie_name, refresh_cookie_name, cookie_secure, cookie_samesite, _ = cookie_cfg()
    response.delete_cookie(key=cookie_name, path="/", samesite=cookie_samesite, secure=cookie_secure)
    response.delete_cookie(key=refresh_cookie_name, path="/", samesite=cookie_samesite, secure=cookie_secure)


def register_auth_routes(api: APIRouter) -> None:
    @api.post("/auth/signup", response_model=AuthResponse)
    def signup(body: SignupBody, response: Response):
        validate_password(body.password, body.email, body.username)
        sb = get_supabase_anon()
        res = sb.auth.sign_up({"email": body.email, "password": body.password})

        if not res or not getattr(res, "user", None):
            raise HTTPException(status_code=400, detail="Signup failed")

        session = getattr(res, "session", None)
        if session:
            set_auth_cookies(
                response,
                getattr(session, "access_token", None),
                getattr(session, "refresh_token", None),
            )

        return AuthResponse(
            user=UserOut(id=res.user.id, email=res.user.email, avatar=body.avatar or "📈"),
            ok=True,
        )

    @api.post("/auth/login", response_model=AuthResponse)
    def login(body: LoginBody, response: Response):
        sb = get_supabase_anon()
        try:
            res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
        except Exception:
            raise HTTPException(status_code=401, detail="Supabase login error")

        if not getattr(res, "user", None) or not getattr(res, "session", None):
            raise HTTPException(status_code=401, detail="Invalid email/password or email not confirmed")

        set_auth_cookies(
            response,
            getattr(res.session, "access_token", None),
            getattr(res.session, "refresh_token", None),
        )

        avatar = None
        try:
            avatar = (res.user.user_metadata or {}).get("avatar")
        except Exception:
            avatar = None

        return AuthResponse(user=UserOut(id=res.user.id, email=res.user.email, avatar=avatar), ok=True)

    @api.post("/auth/logout")
    def logout(response: Response):
        clear_auth_cookies(response)
        return {"ok": True}

    @api.get("/auth/me")
    def me(request: Request, response: Response):
        u = require_user(request, response)
        return {"user_id": u["id"], "email": u["email"]}
