from __future__ import annotations

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.app.app_auth import get_auth_router
from api.app.app_bootstrap import bootstrap_paths, load_env
from api.app.app_routers import register_routers
from api.core.config.settings import get_settings


def create_app() -> FastAPI:
    backend_dir = bootstrap_paths()
    _ = load_env(backend_dir)  # loads .env/.env.local into os.environ
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

    # Preserve FastAPI / Starlette HTTP errors (do not turn them into 500s)
    @app.exception_handler(HTTPException)
    async def _http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(StarletteHTTPException)
    async def _starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    # Catch-all for truly unexpected errors
    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception):
        payload = {"detail": "Server error"}
        if settings.env in ("local", "test", "development"):
            payload["error"] = repr(exc)
        return JSONResponse(status_code=500, content=payload)

    @app.get("/")
    async def root():
        return {
            "name": "u-stock-auth-backend",
            "status": "running",
            "env": settings.env,
            "strict_settings": bool(settings.strict),
        }

    @app.get("/health")
    async def health_root():
        return {"status": "ok", "env": settings.env}

    api = APIRouter(prefix="/api")
    api.include_router(get_auth_router())
    register_routers(app, api)
    app.include_router(api)
    return app
