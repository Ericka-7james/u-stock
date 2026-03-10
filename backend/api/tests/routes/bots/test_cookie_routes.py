from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from api.routes.bots.deps import get_bot_service


@pytest.fixture(autouse=True)
def clear_dependency_overrides(client):
    client.app.dependency_overrides = {}
    yield
    client.app.dependency_overrides = {}


def test_list_bots_returns_available_bots(client):
    mock_svc = Mock()
    mock_svc.available.return_value = {"bots": []}

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    response = client.get("/api/bots")

    assert response.status_code == 200
    assert response.json() == {"bots": []}
    mock_svc.available.assert_called_once_with()


def test_available_returns_available_bots(client):
    mock_svc = Mock()
    mock_svc.available.return_value = {"bots": ["ema_trend"]}

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    response = client.get("/api/bots/available")

    assert response.status_code == 200
    assert response.json() == {"bots": ["ema_trend"]}
    mock_svc.available.assert_called_once_with()


def test_status_returns_bot_status(client):
    mock_svc = Mock()
    mock_svc.status.return_value = {
        "ok": True,
        "bot_id": "ema_trend",
        "armed": True,
    }

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    with patch(
        "api.routes.bots.cookie_routes.require_cookie_user_id",
        return_value="user-123",
    ):
        response = client.get("/api/bots/status", params={"bot_id": "ema_trend"})

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "bot_id": "ema_trend",
        "armed": True,
    }
    mock_svc.status.assert_called_once_with("user-123", "ema_trend")


def test_arm_rejects_non_object_payload(client):
    mock_svc = Mock()
    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    with patch(
        "api.routes.bots.cookie_routes.require_cookie_user_id",
        return_value="user-123",
    ):
        response = client.post(
            "/api/bots/arm",
            json=["not", "an", "object"],
        )

    assert response.status_code == 422
    mock_svc.arm.assert_not_called()


def test_stop_rejects_missing_bot_id(client):
    mock_svc = Mock()
    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    with patch(
        "api.routes.bots.cookie_routes.require_cookie_user_id",
        return_value="user-123",
    ):
        response = client.post("/api/bots/stop", json={})

    assert response.status_code == 400
    assert response.json()["detail"] == "bot_id required"
    mock_svc.stop.assert_not_called()


def test_intents_snapshot_returns_preview(client):
    mock_svc = Mock()
    mock_svc.status.return_value = {
        "lastIntents": 2,
        "lastIntentsAt": 1710000000,
        "lastIntentsPreview": [{"symbol": "AAPL"}, {"symbol": "MSFT"}],
    }

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    with patch(
        "api.routes.bots.cookie_routes.require_cookie_user_id",
        return_value="user-123",
    ):
        response = client.get(
            "/api/bots/intents",
            params={"bot_id": "ema_trend", "limit": 1},
        )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "bot_id": "ema_trend",
        "count": 2,
        "ts": 1710000000,
        "items": [{"symbol": "AAPL"}],
    }
    mock_svc.status.assert_called_once_with("user-123", "ema_trend")