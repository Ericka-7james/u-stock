from __future__ import annotations

from unittest.mock import patch


def test_heartbeat_accepts_runner_payload(client):
    with patch("api.routes.bots.runner_routes.require_bot_runner", return_value="runner-1"), \
         patch("api.routes.bots.runner_routes.require_bot_runner_claims", return_value={"uid": "user-123"}), \
         patch("api.routes.bots.runner_routes.get_bot_service") as mock_get_svc:

        mock_get_svc.return_value.heartbeat.return_value = {
            "ok": True,
            "bot_id": "ema_trend",
        }

        response = client.post(
            "/api/bots/heartbeat",
            json={"bot_id": "ema_trend", "mode": "paper", "ts": 1710000000},
        )

        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.json()["bot_id"] == "ema_trend"


def test_status_runner_returns_status(client):
    with patch("api.routes.bots.runner_routes.require_bot_runner", return_value="runner-1"), \
         patch("api.routes.bots.runner_routes.require_bot_runner_claims", return_value={"uid": "user-123"}), \
         patch("api.routes.bots.runner_routes.get_bot_service") as mock_get_svc:

        mock_get_svc.return_value.status.return_value = {"ok": True, "armed": True}

        response = client.get("/api/bots/status_runner", params={"bot_id": "ema_trend"})

        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["runner_id"] == "runner-1"
        assert body["user_id"] == "user-123"
        assert body["bot_id"] == "ema_trend"


def test_submit_intents_rejects_non_list_items(client):
    with patch("api.routes.bots.runner_routes.require_bot_runner", return_value="runner-1"), \
         patch("api.routes.bots.runner_routes.require_bot_runner_claims", return_value={"uid": "user-123"}):

        response = client.post(
            "/api/bots/submit-intents",
            json={
                "bot_id": "ema_trend",
                "ts": 1710000000,
                "items": "not-a-list",
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "items must be a list"


def test_submit_intents_accepts_valid_items(client):
    with patch("api.routes.bots.runner_routes.require_bot_runner", return_value="runner-1"), \
         patch("api.routes.bots.runner_routes.require_bot_runner_claims", return_value={"uid": "user-123"}), \
         patch("api.routes.bots.runner_routes.get_bot_service") as mock_get_svc:

        mock_get_svc.return_value.submit_intents.return_value = {
            "ok": True,
            "count": 2,
        }

        response = client.post(
            "/api/bots/submit-intents",
            json={
                "bot_id": "ema_trend",
                "ts": 1710000000,
                "items": [{"symbol": "AAPL"}, {"symbol": "MSFT"}],
            },
        )

        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.json()["count"] == 2