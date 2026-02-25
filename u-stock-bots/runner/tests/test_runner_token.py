# u-stock-bots/runner/tests/test_runner_token.py
from __future__ import annotations

import pytest

from runner import runner_token as rt


class DummyAPI:
    def __init__(self, resp=None):
        self.resp = resp
        self.calls = []

    def post(self, path: str, json=None, headers=None):
        self.calls.append((path, json, headers))
        return self.resp


# -------------------------
# _env
# -------------------------

def test_env_strips_and_defaults(monkeypatch):
    monkeypatch.delenv("X_TEST_ENV", raising=False)
    assert rt._env("X_TEST_ENV") == ""
    assert rt._env("X_TEST_ENV", default="  hi ") == "hi"

    monkeypatch.setenv("X_TEST_ENV", "  value  ")
    assert rt._env("X_TEST_ENV") == "value"


# -------------------------
# RunnerTokenManager: configuration
# -------------------------

def test_is_configured_false_when_missing(monkeypatch):
    monkeypatch.delenv("RUNNER_ID", raising=False)
    monkeypatch.delenv("RUNNER_SHARED_SECRET", raising=False)

    m = rt.RunnerTokenManager()
    assert m.is_configured() is False


def test_is_configured_true_when_present(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    m = rt.RunnerTokenManager()
    assert m.is_configured() is True


# -------------------------
# _needs_refresh
# -------------------------

def test_needs_refresh_true_when_no_token(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    m = rt.RunnerTokenManager()
    assert m._needs_refresh() is True


def test_needs_refresh_true_when_no_exp(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    m = rt.RunnerTokenManager()
    m._token = "abc"
    m._exp_epoch = 0
    assert m._needs_refresh() is True


def test_needs_refresh_true_within_60s_skew(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    # now_epoch mocked to 1000, exp=1059 => exp-60=999 => needs refresh
    monkeypatch.setattr(rt, "now_epoch", lambda: 1000)

    m = rt.RunnerTokenManager()
    m._token = "abc"
    m._exp_epoch = 1059
    assert m._needs_refresh() is True


def test_needs_refresh_false_when_token_valid_and_not_near_expiry(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    monkeypatch.setattr(rt, "now_epoch", lambda: 1000)

    m = rt.RunnerTokenManager()
    m._token = "abc"
    m._exp_epoch = 2000  # exp-60 = 1940, now=1000 => no refresh
    assert m._needs_refresh() is False


# -------------------------
# get_token: config gate
# -------------------------

def test_get_token_raises_when_not_configured(monkeypatch):
    monkeypatch.delenv("RUNNER_ID", raising=False)
    monkeypatch.delenv("RUNNER_SHARED_SECRET", raising=False)

    m = rt.RunnerTokenManager()
    with pytest.raises(RuntimeError, match="Set RUNNER_ID and RUNNER_SHARED_SECRET"):
        m.get_token(DummyAPI(resp={"token": "x", "expires_in": 10}))


# -------------------------
# get_token: caching behavior
# -------------------------

def test_get_token_returns_cached_without_calling_api(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    monkeypatch.setattr(rt, "now_epoch", lambda: 1000)

    api = DummyAPI(resp={"token": "NEW", "expires_in": 10})
    m = rt.RunnerTokenManager()
    m._token = "CACHED"
    m._exp_epoch = 5000  # far in future -> no refresh

    tok = m.get_token(api)
    assert tok == "CACHED"
    assert api.calls == []


# -------------------------
# get_token: minting success
# -------------------------

def test_get_token_mints_and_sets_exp(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    monkeypatch.setattr(rt, "now_epoch", lambda: 1000)

    api = DummyAPI(resp={"token": "  T123  ", "expires_in": 300})
    m = rt.RunnerTokenManager()

    tok = m.get_token(api)
    assert tok == "T123"
    assert m._token == "T123"
    assert m._exp_epoch == 1300  # 1000 + 300

    assert len(api.calls) == 1
    path, body, headers = api.calls[0]
    assert path == "/runner/token"
    assert body == {"runner_id": "runner-1"}
    assert headers == {"X-Runner-Secret": "secret"}


# -------------------------
# get_token: error handling for bad responses
# -------------------------

@pytest.mark.parametrize(
    "resp",
    [
        None,
        "nope",
        {},
        {"expires_in": 10},               # missing token
        {"token": "" , "expires_in": 10}, # empty token
    ],
)
def test_get_token_raises_when_response_missing_token(monkeypatch, resp):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    api = DummyAPI(resp=resp)
    m = rt.RunnerTokenManager()

    with pytest.raises(RuntimeError, match="Failed to mint runner token"):
        m.get_token(api)


@pytest.mark.parametrize(
    "resp",
    [
        {"token": "T", "expires_in": 0},
        {"token": "T", "expires_in": -5},
        {"token": "T", "expires_in": "0"},
        {"token": "T", "expires_in": "nope"},  # int(...) will throw -> test expects ValueError currently
    ],
)
def test_get_token_raises_when_expires_in_invalid(monkeypatch, resp):
    """
    Note: expires_in is cast via int(...). If server returns non-numeric like "nope",
    Python will raise ValueError (not caught). This test documents that current behavior.
    If you want fail-soft, we can adjust runner_token.py and update this test accordingly.
    """
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    monkeypatch.setattr(rt, "now_epoch", lambda: 1000)

    api = DummyAPI(resp=resp)
    m = rt.RunnerTokenManager()

    if resp.get("expires_in") == "nope":
        with pytest.raises(ValueError):
            m.get_token(api)
    else:
        with pytest.raises(RuntimeError, match="Bad runner token response"):
            m.get_token(api)


def test_get_token_strips_token_and_rejects_blank_after_strip(monkeypatch):
    monkeypatch.setenv("RUNNER_ID", "runner-1")
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "secret")

    monkeypatch.setattr(rt, "now_epoch", lambda: 1000)

    api = DummyAPI(resp={"token": "   ", "expires_in": 10})
    m = rt.RunnerTokenManager()

    with pytest.raises(RuntimeError, match="Bad runner token response"):
        m.get_token(api)