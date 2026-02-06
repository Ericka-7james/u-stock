# backend/api/app/app_factory.py
from __future__ import annotations

import os

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.app.app_auth import get_auth_router
from api.app.app_bootstrap import bootstrap_paths, load_env
from api.app.app_routers import register_routers
from api.core.config import get_settings


def _effective_env(settings_env: str) -> str:
    """
    Test runner sets ENV=test via cross-env.
    We must not let a loaded .env override that.
    """
    raw = (os.getenv("ENV") or "").strip().lower()
    if raw:
        return raw
    return (settings_env or "development").strip().lower()


def create_app() -> FastAPI:
    backend_dir = bootstrap_paths()
    _ = load_env(backend_dir)  # loads .env/.env.local into os.environ

    # ✅ CRITICAL: Settings are cached; env is loaded *now*, so clear cache.
    # Without this, CORS origins can get "stuck" from earlier imports.
    get_settings.cache_clear()
    settings = get_settings()

    app = FastAPI(title="u-stock-auth-backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["set-cookie"],
    )

    # Preserve FastAPI HTTP errors (do not turn them into 500s)
    @app.exception_handler(HTTPException)
    async def _http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    # Preserve Starlette HTTP errors
    @app.exception_handler(StarletteHTTPException)
    async def _starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    # Catch-all for unexpected errors
    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception):
        env = (os.getenv("ENV") or "development").strip().lower()

        payload = {"detail": "Server error"}
        if env != "production":
            payload["error"] = repr(exc)

        return JSONResponse(status_code=500, content=payload)

    @app.get("/")
    async def root():
        env = _effective_env(settings.env)
        return {
            "name": "u-stock-auth-backend",
            "status": "running",
            "env": env,
            "strict_settings": bool(getattr(settings, "strict", False)),
            "cors_origins": settings.cors_origins if env != "production" else None,
        }

    @app.get("/health")
    async def health_root():
        env = _effective_env(settings.env)
        return {"status": "ok", "env": env}

    api = APIRouter(prefix="/api")
    api.include_router(get_auth_router())
    register_routers(app, api)
    app.include_router(api)

    return app
