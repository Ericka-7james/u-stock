from __future__ import annotations

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.app.app_auth import register_auth_routes
from api.app.app_bootstrap import bootstrap_paths, cors_origins, load_env, load_settings
from api.app.app_routers import register_routers


def create_app() -> FastAPI:
    backend_dir = bootstrap_paths()
    env = load_env(backend_dir)
    _settings, strict_settings = load_settings(env)

    app = FastAPI(title="u-stock-auth-backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["set-cookie"],
    )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception):
        payload = {"detail": "Server error"}
        if env in ("local", "test", "development"):
            payload["error"] = repr(exc)
        return JSONResponse(status_code=500, content=payload)

    @app.get("/")
    def root():
        return {
            "name": "u-stock-auth-backend",
            "status": "running",
            "env": env,
            "strict_settings": bool(strict_settings),
        }

    @app.get("/health")
    def health_root():
        return {"status": "ok", "env": env}

    api = APIRouter(prefix="/api")
    register_auth_routes(api)
    register_routers(app, api)
    app.include_router(api)
    return app
