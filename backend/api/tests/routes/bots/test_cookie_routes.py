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
    mock_sb = Mock()
    mock_query = Mock()

    mock_sb.table.return_value = mock_query
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.order.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.execute.return_value = Mock(
        data=[
            {
                "ts": 1710000000,
                "action": "intent_summary",
                "source": "runner",
                "details": {
                    "count": 2,
                    "preview": [{"symbol": "AAPL"}, {"symbol": "MSFT"}],
                },
            }
        ]
    )

    with patch(
        "api.routes.bots.cookie_routes.require_cookie_user_id",
        return_value="user-123",
    ), patch(
        "api.routes.bots.cookie_routes.get_supabase_service",
        return_value=mock_sb,
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

    mock_sb.table.assert_called_once_with("bot_logs")
    mock_query.select.assert_called_once_with("ts,details,action,source")
    mock_query.eq.assert_any_call("user_id", "user-123")
    mock_query.eq.assert_any_call("bot_id", "ema_trend")
    mock_query.eq.assert_any_call("source", "runner")
    mock_query.order.assert_called_once_with("ts", desc=True)
    mock_query.limit.assert_called_once_with(50)
    mock_query.execute.assert_called_once_with()