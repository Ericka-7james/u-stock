# backend/api/tests/conftest.py
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes.bots import router as bots_router


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(bots_router)
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    app.dependency_overrides = {}
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides = {}