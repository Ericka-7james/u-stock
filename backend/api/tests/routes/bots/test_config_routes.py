from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from api.routes.bots.deps import get_bot_service


@pytest.fixture(autouse=True)
def clear_dependency_overrides(client):
    client.app.dependency_overrides = {}
    yield
    client.app.dependency_overrides = {}


def test_get_config_returns_config(client):
    mock_svc = Mock()
    mock_svc.get_config.return_value = {
        "ok": True,
        "config": {"risk_limit": 0.02},
    }

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    with patch(
        "api.routes.bots.config_routes.require_cookie_user_id",
        return_value="user-123",
    ):
        response = client.get("/api/bots/config", params={"bot_id": "ema_trend"})

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "config": {"risk_limit": 0.02},
    }
    mock_svc.get_config.assert_called_once_with("user-123", "ema_trend")


def test_set_config_rejects_non_object_config(client):
    mock_svc = Mock()
    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    with patch(
        "api.routes.bots.config_routes.require_cookie_user_id",
        return_value="user-123",
    ):
        response = client.post(
            "/api/bots/config",
            json={"bot_id": "ema_trend", "config": "not-an-object"},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "config must be an object"
    mock_svc.set_config.assert_not_called()


def test_set_config_accepts_valid_config(client):
    mock_svc = Mock()
    mock_svc.set_config.return_value = {
        "ok": True,
        "config": {"risk_limit": 0.03},
    }

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc

    with patch(
        "api.routes.bots.config_routes.require_cookie_user_id",
        return_value="user-123",
    ):
        response = client.post(
            "/api/bots/config",
            json={
                "bot_id": "ema_trend",
                "config": {"risk_limit": 0.03},
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "config": {"risk_limit": 0.03},
    }
    mock_svc.set_config.assert_called_once_with(
        "user-123",
        "ema_trend",
        {"risk_limit": 0.03},
    )