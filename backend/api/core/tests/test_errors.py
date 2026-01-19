# api/core/tests/test_errors.py
from fastapi import HTTPException

from api.core.errors import http_error


def test_http_error_minimal_payload():
    exc = http_error(400, "BAD_REQUEST", "Nope")
    assert isinstance(exc, HTTPException)
    assert exc.status_code == 400
    assert exc.detail == {"code": "BAD_REQUEST", "message": "Nope"}


def test_http_error_includes_detail_when_provided():
    exc = http_error(401, "ALPACA_INVALID_KEY", "Invalid credentials", detail={"provider": "alpaca"})
    assert exc.status_code == 401
    assert exc.detail["code"] == "ALPACA_INVALID_KEY"
    assert exc.detail["message"] == "Invalid credentials"
    assert exc.detail["detail"] == {"provider": "alpaca"}


def test_http_error_includes_hint_when_non_empty():
    exc = http_error(403, "FORBIDDEN", "No access", hint="Ask admin")
    assert exc.detail["hint"] == "Ask admin"


def test_http_error_omits_hint_when_empty_or_whitespace():
    exc1 = http_error(403, "FORBIDDEN", "No access", hint="")
    exc2 = http_error(403, "FORBIDDEN", "No access", hint="   ")
    assert "hint" not in exc1.detail
    assert "hint" not in exc2.detail
