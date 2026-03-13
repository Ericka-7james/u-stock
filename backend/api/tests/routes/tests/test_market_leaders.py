# backend/api/routes/tests/test_market_leaders.py
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import api.routes.market_leaders as mod
import api.routes.opportunities as opp_mod  # ✅ add this


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(mod.router)
    app.include_router(opp_mod.router)  # ✅ if not already included elsewhere

    # ✅ runner endpoints: bypass auth in tests
    app.dependency_overrides[opp_mod.require_bot_runner] = lambda: "runner-user-1"
    # (optional) if you test /leaders/runner too:
    app.dependency_overrides[mod.require_bot_runner] = lambda: "runner-user-1"

    return app


@pytest.fixture()
def client(app):
    return TestClient(app)