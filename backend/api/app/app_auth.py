from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from api.core.http.cookies import clear_auth_cookies, set_auth_cookies
from api.db import get_supabase_anon
from api.deps import require_user
from api.schemas.auth import AuthResponse, LoginBody, SignupBody, UserOut, validate_password


def get_auth_router() -> APIRouter:
    router = APIRouter()

    @router.post("/auth/signup", response_model=AuthResponse)
    async def signup(body: SignupBody, response: Response):
        validate_password(body.password, body.email, body.username)

        sb = get_supabase_anon()
        try:
            res = sb.auth.sign_up({"email": body.email, "password": body.password})
        except Exception:
            raise HTTPException(status_code=400, detail="Signup failed")

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

    @router.post("/auth/login", response_model=AuthResponse)
    async def login(body: LoginBody, response: Response):
        sb = get_supabase_anon()
        try:
            res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid email/password")

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

    @router.post("/auth/logout")
    async def logout(response: Response):
        clear_auth_cookies(response)
        return {"ok": True}

    @router.get("/auth/me")
    async def me(request: Request, response: Response):
        u = require_user(request, response)
        return {"user_id": u["id"], "email": u["email"]}

    return router
