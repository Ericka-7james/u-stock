# backend/api/app/app_routers.py
from __future__ import annotations

from fastapi import APIRouter, FastAPI

from api.alpaca_data import router as alpaca_router
from api.alpaca_trading import router as alpaca_trading_router
from api.cron import router as cron_router

from api.routes.auth_bot_runner import router as auth_bot_runner_router
from api.routes.calendar import router as calendar_router
from api.routes.fx import router as fx_router
from api.routes.fundamentals import router as fundamentals_router
from api.routes.integrations import router as integrations_router
from api.routes.integrations_alpaca import router as integrations_alpaca_router
from api.routes.macro import router as macro_router
from api.routes.market_leaders import router as market_leaders_router
from api.routes.market_us import router as market_us_router
from api.routes.opportunities import router as opportunities_router

from api.routes.trade_fills import router as trade_fills_router
from api.routes.trade_fills_ingest import router as trade_fills_ingest_router

# ✅ NEW: bot control routes
from api.routes.bots import router as bots_router

try:
    from api.routes.health import router as health_router
except Exception:
    health_router = None


def register_routers(app: FastAPI, api: APIRouter) -> None:
    app.include_router(cron_router, prefix="/api")
    app.include_router(alpaca_router, prefix="/api")
    app.include_router(alpaca_trading_router, prefix="/api")

    app.include_router(market_us_router)
    app.include_router(macro_router)
    app.include_router(fundamentals_router)
    app.include_router(calendar_router)
    app.include_router(fx_router)
    app.include_router(opportunities_router)

    if health_router is not None:
        app.include_router(health_router)

    app.include_router(auth_bot_runner_router, prefix="/api")
    app.include_router(integrations_alpaca_router, prefix="/api")
    app.include_router(integrations_router, prefix="/api")
    app.include_router(market_leaders_router)

    # ✅ NEW: start/stop/status/report endpoints
    app.include_router(bots_router)

    app.include_router(trade_fills_router)
    app.include_router(trade_fills_ingest_router)
