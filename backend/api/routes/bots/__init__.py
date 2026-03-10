"""Bots route package.

This package contains the modularized FastAPI route handlers that were
previously defined in a single `bots.py` module.

The package-level router composes child routers into the public bots API.
Each child module is organized by concern:

- `cookie_routes.py`: Cookie-authenticated UI endpoints.
- `config_routes.py`: Cookie-authenticated bot config endpoints.
- `runner_routes.py`: Runner-authenticated bot-to-server endpoints.
- `deps.py`: Shared dependency helpers for bot routes.
- `utils.py`: Shared validation and transformation helpers for bot routes.

Route prefixing:
    The public prefix is defined here at the package router level so child
    route modules can remain prefix-free and focused on endpoint behavior.

Public API:
    Mounted under `/api/bots`.

Example:
    `GET /api/bots/status?bot_id=ema_trend`
"""

from fastapi import APIRouter

from .config_routes import router as config_router
from .cookie_routes import router as cookie_router
from .runner_routes import router as runner_router

router = APIRouter(prefix="/api/bots", tags=["bots"])

router.include_router(cookie_router)
router.include_router(config_router)
router.include_router(runner_router)