from __future__ import annotations

from fastapi import Response

from api.core.config.settings import get_settings


def set_auth_cookies(response: Response, access_token: str | None, refresh_token: str | None = None) -> None:
    s = get_settings()
    c = s.cookies

    if access_token:
        response.set_cookie(
            key=c.name,
            value=access_token,
            httponly=True,
            secure=c.secure,
            samesite=c.samesite,
            max_age=c.max_age,
            path="/",
            domain=c.domain,
        )

    if refresh_token:
        response.set_cookie(
            key=c.refresh_name,
            value=refresh_token,
            httponly=True,
            secure=c.secure,
            samesite=c.samesite,
            max_age=c.max_age,
            path="/",
            domain=c.domain,
        )


def clear_auth_cookies(response: Response) -> None:
    s = get_settings()
    c = s.cookies

    response.delete_cookie(key=c.name, path="/", samesite=c.samesite, secure=c.secure, domain=c.domain)
    response.delete_cookie(key=c.refresh_name, path="/", samesite=c.samesite, secure=c.secure, domain=c.domain)
