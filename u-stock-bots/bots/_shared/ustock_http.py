from __future__ import annotations

"""HTTP client for communicating with the U-Stock backend.

This module provides a production-minded HTTP client used by runner-side code
to communicate with backend API endpoints. It includes:

- persistent HTTP session reuse
- connection pooling
- retry handling for transient transport and backend failures
- a lightweight circuit breaker to avoid hammering an unhealthy backend
- optional runner authentication headers and user binding headers

Environment variables:
    USTOCK_API_BASE:
        Base URL for the backend API. Defaults to http://localhost:8000.
    USTOCK_HTTP_TIMEOUT:
        Request timeout in seconds. Defaults to 15.
    USTOCK_HTTP_RETRIES:
        Number of retries for transient failures. Defaults to 3.
    USTOCK_HTTP_BACKOFF:
        Base backoff factor for retries. Defaults to 0.35.
    USTOCK_HTTP_POOL_MAX:
        Maximum connection pool size. Defaults to 20.

Authentication:
    RUNNER_TOKEN:
        Preferred runner JWT sent as Bearer token.
    BOT_RUNNER_TOKEN:
        Legacy alias for runner JWT.
    RUNNER_SHARED_SECRET:
        Preferred shared secret used for token minting flows.
    BOT_RUNNER_SECRET:
        Legacy shared-secret fallback.
    RUNNER_USER_ID:
        Preferred runner-bound user id header value.
    USTOCK_USER_ID:
        Legacy alias for runner-bound user id.

Circuit breaker:
    USTOCK_CB_ENABLED:
        Enables the circuit breaker when not explicitly false.
    USTOCK_CB_FAILS:
        Number of consecutive backend-style failures before opening.
    USTOCK_CB_RESET:
        Seconds to wait before allowing half-open trial calls.
    USTOCK_CB_HALF_OPEN_CALLS:
        Number of half-open trial calls allowed.
"""

import os
import random
import time
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


@dataclass
class CircuitBreakerConfig:
    """Configuration for the internal circuit breaker.

    Attributes:
        enabled: Whether the circuit breaker is active.
        failure_threshold: Number of consecutive failures required to open it.
        reset_timeout_seconds: Seconds to remain open before half-open trials.
        half_open_max_calls: Number of trial calls allowed in half-open state.
    """

    enabled: bool = True
    failure_threshold: int = 5
    reset_timeout_seconds: int = 30
    half_open_max_calls: int = 1


class CircuitBreakerOpen(RuntimeError):
    """Raised when the circuit breaker blocks a request."""


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        str: Trimmed environment variable value or the provided default.
    """
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int) -> int:
    """Returns an integer environment variable with fallback.

    Args:
        name: Environment variable name.
        default: Fallback integer value.

    Returns:
        int: Parsed integer value or the provided default.
    """
    raw = _env(name, "")
    if raw == "":
        return int(default)

    try:
        return int(raw)
    except Exception:
        return int(default)


def _env_float(name: str, default: float) -> float:
    """Returns a float environment variable with fallback.

    Args:
        name: Environment variable name.
        default: Fallback float value.

    Returns:
        float: Parsed float value or the provided default.
    """
    raw = _env(name, "")
    if raw == "":
        return float(default)

    try:
        return float(raw)
    except Exception:
        return float(default)


def _env_bool(name: str, default: bool = False) -> bool:
    """Returns a boolean environment variable value.

    Truthy values include: 1, true, t, yes, y, on.

    Args:
        name: Environment variable name.
        default: Fallback boolean value.

    Returns:
        bool: Parsed boolean value.
    """
    raw = _env(name, "")
    if raw == "":
        return bool(default)
    return raw.lower() in ("1", "true", "t", "yes", "y", "on")


class _CircuitBreaker:
    """Small in-memory circuit breaker for backend health protection.

    State model:
        CLOSED:
            Allow traffic and count consecutive backend-style failures.
        OPEN:
            Block all calls until the reset timeout expires.
        HALF_OPEN:
            Allow a limited number of trial calls. Success closes the breaker.
            Failure reopens it.

    This breaker is process-local and intended for runner/client-side use.
    """

    def __init__(self, cfg: CircuitBreakerConfig):
        """Initializes the circuit breaker.

        Args:
            cfg: Circuit breaker configuration.
        """
        self.cfg = cfg
        self.state: str = "closed"
        self.consecutive_failures: int = 0
        self.opened_at: float = 0.0
        self.half_open_calls_left: int = max(1, int(cfg.half_open_max_calls or 1))

    def allow(self) -> None:
        """Checks whether a request is allowed right now.

        Raises:
            CircuitBreakerOpen: If the breaker is open or half-open capacity is
                exhausted.
        """
        if not self.cfg.enabled:
            return

        now = time.time()

        if self.state == "open":
            if (now - self.opened_at) >= float(self.cfg.reset_timeout_seconds):
                self.state = "half_open"
                self.half_open_calls_left = max(1, int(self.cfg.half_open_max_calls or 1))
            else:
                raise CircuitBreakerOpen("Circuit breaker is OPEN (backend unhealthy)")

        if self.state == "half_open":
            if self.half_open_calls_left <= 0:
                raise CircuitBreakerOpen("Circuit breaker HALF_OPEN trial limit reached")
            self.half_open_calls_left -= 1

    def on_success(self) -> None:
        """Marks a successful backend interaction and closes the breaker."""
        if not self.cfg.enabled:
            return

        self.consecutive_failures = 0
        self.state = "closed"
        self.opened_at = 0.0
        self.half_open_calls_left = max(1, int(self.cfg.half_open_max_calls or 1))

    def on_failure(self) -> None:
        """Marks a backend-style failure and opens the breaker if needed."""
        if not self.cfg.enabled:
            return

        self.consecutive_failures += 1
        if self.consecutive_failures >= int(self.cfg.failure_threshold):
            self.state = "open"
            self.opened_at = time.time()
            self.half_open_calls_left = max(1, int(self.cfg.half_open_max_calls or 1))


class UStockAPI:
    """HTTP client for the U-Stock backend.

    This client is intended for runner and backend-adjacent automation use. It
    manages a persistent session, retry policy, optional runner auth headers,
    and a circuit breaker for unhealthy backend conditions.
    """

    def __init__(self, base_url: Optional[str] = None, timeout: Optional[int] = None):
        """Initializes the API client.

        Args:
            base_url: Optional override for the backend base URL.
            timeout: Optional override for request timeout in seconds.
        """
        base = base_url or _env("USTOCK_API_BASE") or "http://localhost:8000"
        self.base_url = base.rstrip("/") + "/"

        self.timeout = max(1, int(timeout or _env_int("USTOCK_HTTP_TIMEOUT", 15)))
        self.session = requests.Session()

        self.runner_token = _env("RUNNER_TOKEN") or _env("BOT_RUNNER_TOKEN")
        self.runner_secret = _env("RUNNER_SHARED_SECRET") or _env("BOT_RUNNER_SECRET")
        self.runner_user_id = _env("RUNNER_USER_ID") or _env("USTOCK_USER_ID")

        self.retries = max(0, _env_int("USTOCK_HTTP_RETRIES", 3))
        self.backoff = max(0.05, _env_float("USTOCK_HTTP_BACKOFF", 0.35))

        cb_cfg = CircuitBreakerConfig(
            enabled=_env_bool("USTOCK_CB_ENABLED", True),
            failure_threshold=max(1, _env_int("USTOCK_CB_FAILS", 5)),
            reset_timeout_seconds=max(1, _env_int("USTOCK_CB_RESET", 30)),
            half_open_max_calls=max(1, _env_int("USTOCK_CB_HALF_OPEN_CALLS", 1)),
        )
        self.cb = _CircuitBreaker(cb_cfg)

        pool_max = max(1, _env_int("USTOCK_HTTP_POOL_MAX", 20))

        status_retry = Retry(
            total=self.retries,
            connect=self.retries,
            read=self.retries,
            status=self.retries,
            backoff_factor=self.backoff,
            status_forcelist=(502, 503, 504),
            allowed_methods=frozenset(["GET", "POST", "PUT", "PATCH", "DELETE"]),
            raise_on_status=False,
            respect_retry_after_header=True,
        )

        adapter = HTTPAdapter(
            max_retries=status_retry,
            pool_connections=pool_max,
            pool_maxsize=pool_max,
        )
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def close(self) -> None:
        """Closes the underlying HTTP session."""
        self.session.close()

    def __enter__(self) -> "UStockAPI":
        """Enters the context-manager session.

        Returns:
            UStockAPI: This client instance.
        """
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        """Exits the context-manager session."""
        self.close()

    def _default_headers(self) -> Dict[str, str]:
        """Builds default headers for outgoing requests.

        Returns:
            Dict[str, str]: Default request headers.
        """
        headers: Dict[str, str] = {"accept": "application/json"}

        if self.runner_token:
            headers["Authorization"] = f"Bearer {self.runner_token}"

        if self.runner_secret:
            headers["X-Runner-Secret"] = self.runner_secret
            headers["X-Bot-Runner-Secret"] = self.runner_secret

        if self.runner_user_id:
            headers["X-Runner-User-Id"] = self.runner_user_id
            headers["X-Bot-Runner-User-Id"] = self.runner_user_id

        return headers

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Normalizes an API path.

        Behavior:
            - ensures a leading slash
            - ensures the route lives under /api unless already prefixed

        Args:
            path: Raw request path.

        Returns:
            str: Normalized API path.
        """
        p = "/" + str(path or "").lstrip("/")

        if p.startswith("/api/"):
            return p

        return "/api" + p

    def _sleep_backoff(self, attempt: int) -> None:
        """Sleeps using exponential backoff with jitter.

        Args:
            attempt: Zero-based retry attempt number.
        """
        delay = self.backoff * (2 ** attempt)
        delay = delay * (0.7 + random.random() * 0.6)
        time.sleep(min(delay, 3.5))

    @staticmethod
    def _truncate_body(text: str, limit: int = 800) -> str:
        """Truncates response text for error messages.

        Args:
            text: Raw response text.
            limit: Maximum returned length.

        Returns:
            str: Trimmed and truncated response text.
        """
        t = (text or "").strip()
        return t[:limit]

    @staticmethod
    def _json_or_text(response: requests.Response) -> Any:
        """Parses a response as JSON when possible.

        Args:
            response: HTTP response object.

        Returns:
            Any: Parsed JSON content or plain text.
        """
        content_type = (response.headers.get("content-type") or "").lower()
        if "application/json" in content_type:
            return response.json()

        text = (response.text or "").strip()
        if text.startswith("{") or text.startswith("["):
            return response.json()

        return text

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json: Optional[Any] = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        """Performs an HTTP request with retries and circuit-breaker protection.

        Args:
            method: HTTP method name.
            path: API path or backend-relative route.
            params: Optional query parameters.
            json: Optional JSON request body.
            headers: Optional additional headers.

        Raises:
            CircuitBreakerOpen: If the circuit breaker blocks the call.
            requests.HTTPError: If the request fails with a non-retriable HTTP
                status or retries are exhausted.
            requests.ConnectionError: If connection retries are exhausted.
            requests.Timeout: If timeout retries are exhausted.
            RuntimeError: If the request fails without a captured exception.

        Returns:
            Any: Parsed JSON response or text body.
        """
        self.cb.allow()

        norm = self._normalize_path(path)
        url = urljoin(self.base_url, norm.lstrip("/"))

        req_headers = self._default_headers()
        if headers:
            req_headers.update({str(k): str(v) for k, v in headers.items()})

        last_exc: Optional[Exception] = None

        for attempt in range(0, max(1, self.retries + 1)):
            try:
                response = self.session.request(
                    method=str(method).upper(),
                    url=url,
                    params=dict(params) if params is not None else None,
                    json=json,
                    headers=req_headers,
                    timeout=self.timeout,
                )

                if response.status_code in (502, 503, 504):
                    body = self._truncate_body(response.text)
                    self.cb.on_failure()
                    raise requests.HTTPError(
                        f"{response.status_code} {response.reason} | {body}",
                        response=response,
                    )

                try:
                    response.raise_for_status()
                except requests.HTTPError as exc:
                    body = self._truncate_body(response.text)
                    code = int(getattr(response, "status_code", 0) or 0)

                    if code >= 500:
                        self.cb.on_failure()
                    else:
                        self.cb.on_success()

                    raise requests.HTTPError(
                        f"{response.status_code} {response.reason} | {body}",
                        response=response,
                    ) from exc

                self.cb.on_success()
                return self._json_or_text(response)

            except (requests.ConnectionError, requests.Timeout) as exc:
                last_exc = exc
                self.cb.on_failure()
                if attempt >= self.retries:
                    break
                self._sleep_backoff(attempt)
                continue

            except requests.HTTPError as exc:
                last_exc = exc
                response = getattr(exc, "response", None)
                code = int(getattr(response, "status_code", 0) or 0)

                if code >= 500 and attempt < self.retries:
                    self._sleep_backoff(attempt)
                    continue
                raise

            except Exception as exc:
                last_exc = exc
                self.cb.on_failure()
                raise

        if last_exc is not None:
            raise last_exc
        raise RuntimeError("Request failed")

    def get(
        self,
        path: str,
        params: Optional[Mapping[str, Any]] = None,
        *,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        """Performs a GET request.

        Args:
            path: API path or backend-relative route.
            params: Optional query parameters.
            headers: Optional additional headers.

        Returns:
            Any: Parsed response body.
        """
        return self.request("GET", path, params=params, headers=headers)

    def post(
        self,
        path: str,
        json: Optional[Any] = None,
        *,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        """Performs a POST request.

        Args:
            path: API path or backend-relative route.
            json: Optional JSON request body.
            headers: Optional additional headers.

        Returns:
            Any: Parsed response body.
        """
        return self.request("POST", path, json=json, headers=headers)