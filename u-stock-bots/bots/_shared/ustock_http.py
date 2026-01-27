from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


@dataclass
class CircuitBreakerConfig:
    enabled: bool = True
    failure_threshold: int = 5          # open after N consecutive failures
    reset_timeout_seconds: int = 30     # how long to stay open before half-open trial
    half_open_max_calls: int = 1        # allow N trial calls in half-open


class CircuitBreakerOpen(RuntimeError):
    pass


class _CircuitBreaker:
    """
    Simple circuit breaker:
      CLOSED -> allow traffic; count consecutive failures
      OPEN   -> block all calls until reset timeout passes
      HALF_OPEN -> allow a small number of trial calls; if success -> CLOSED, else -> OPEN
    """
    def __init__(self, cfg: CircuitBreakerConfig):
        self.cfg = cfg
        self.state: str = "closed"  # closed | open | half_open
        self.consecutive_failures: int = 0
        self.opened_at: float = 0.0
        self.half_open_calls_left: int = int(cfg.half_open_max_calls or 1)

    def allow(self) -> None:
        if not self.cfg.enabled:
            return

        now = time.time()

        if self.state == "open":
            if (now - self.opened_at) >= float(self.cfg.reset_timeout_seconds):
                # move to half-open
                self.state = "half_open"
                self.half_open_calls_left = max(1, int(self.cfg.half_open_max_calls))
            else:
                raise CircuitBreakerOpen("Circuit breaker is OPEN (backend unhealthy)")

        if self.state == "half_open":
            if self.half_open_calls_left <= 0:
                raise CircuitBreakerOpen("Circuit breaker HALF_OPEN trial limit reached")
            self.half_open_calls_left -= 1

    def on_success(self) -> None:
        if not self.cfg.enabled:
            return
        self.consecutive_failures = 0
        self.state = "closed"
        self.opened_at = 0.0
        self.half_open_calls_left = max(1, int(self.cfg.half_open_max_calls))

    def on_failure(self) -> None:
        if not self.cfg.enabled:
            return
        self.consecutive_failures += 1
        if self.consecutive_failures >= int(self.cfg.failure_threshold):
            self.state = "open"
            self.opened_at = time.time()
            self.half_open_calls_left = max(1, int(self.cfg.half_open_max_calls))


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


class UStockAPI:
    """
    Production-minded HTTP client for the U-Stock API.

    Features:
      - requests.Session w/ connection pooling via HTTPAdapter
      - retry policy for transient failures (timeouts, 502/503/504, connection resets)
      - optional circuit breaker to stop hammering backend during outages

    Env:
      - USTOCK_API_BASE (default http://localhost:8000)
      - BOT_RUNNER_SECRET (optional -> X-Bot-Runner-Secret header)
      - RUNNER_USER_ID (optional -> X-Runner-User-Id header)

      - USTOCK_HTTP_RETRIES (default 3)
      - USTOCK_HTTP_BACKOFF (default 0.35)  # base backoff seconds
      - USTOCK_HTTP_POOL_MAX (default 20)
      - USTOCK_CB_ENABLED (default true)
      - USTOCK_CB_FAILS (default 5)
      - USTOCK_CB_RESET (default 30)
    """

    def __init__(self, base_url: Optional[str] = None, timeout: int = 15):
        base = base_url or _env("USTOCK_API_BASE") or "http://localhost:8000"
        self.base_url = base.rstrip("/") + "/"

        self.timeout = int(timeout)
        self.session = requests.Session()

        self.runner_secret = _env("BOT_RUNNER_SECRET")
        self.runner_user_id = _env("RUNNER_USER_ID")

        # Retry policy knobs
        self.retries = int(_env("USTOCK_HTTP_RETRIES", "3") or 3)
        self.backoff = float(_env("USTOCK_HTTP_BACKOFF", "0.35") or 0.35)

        # Circuit breaker
        cb_cfg = CircuitBreakerConfig(
            enabled=(_env("USTOCK_CB_ENABLED", "true").lower() != "false"),
            failure_threshold=int(_env("USTOCK_CB_FAILS", "5") or 5),
            reset_timeout_seconds=int(_env("USTOCK_CB_RESET", "30") or 30),
            half_open_max_calls=1,
        )
        self.cb = _CircuitBreaker(cb_cfg)

        # HTTPAdapter connection pooling + urllib3 retry for status codes
        pool_max = int(_env("USTOCK_HTTP_POOL_MAX", "20") or 20)

        status_retry = Retry(
            total=self.retries,
            connect=self.retries,
            read=self.retries,
            status=self.retries,
            backoff_factor=self.backoff,
            status_forcelist=(502, 503, 504),
            allowed_methods=frozenset(["GET", "POST", "PUT", "PATCH", "DELETE"]),
            raise_on_status=False,  # we'll raise ourselves with truncated body
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
        self.session.close()

    def __enter__(self) -> "UStockAPI":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def _default_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {"accept": "application/json"}
        if self.runner_secret:
            headers["X-Bot-Runner-Secret"] = self.runner_secret
        if self.runner_user_id:
            headers["X-Runner-User-Id"] = self.runner_user_id
        return headers

    @staticmethod
    def _normalize_path(path: str) -> str:
        """
        Ensure:
          - leading slash
          - routes are under /api unless already /api/...
        """
        p = "/" + str(path or "").lstrip("/")
        if p.startswith("/api/"):
            return p
        return "/api" + p

    def _sleep_backoff(self, attempt: int) -> None:
        """
        Extra backoff for exceptions that urllib3 doesn't always retry well
        (ex: connection reset mid-flight).
        """
        base = max(0.05, float(self.backoff))
        delay = base * (2 ** attempt)
        delay = delay * (0.7 + random.random() * 0.6)  # jitter
        time.sleep(min(delay, 3.5))

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        self.cb.allow()

        norm = self._normalize_path(path)
        url = urljoin(self.base_url, norm.lstrip("/"))

        h = self._default_headers()
        if headers:
            h.update(headers)

        last_exc: Optional[Exception] = None

        # Manual retry loop for "hard" transient exceptions
        for attempt in range(0, max(1, self.retries + 1)):
            try:
                r = self.session.request(
                    method=str(method).upper(),
                    url=url,
                    params=params,
                    json=json,
                    headers=h,
                    timeout=self.timeout,
                )

                # If adapter retried and still got 502/503/504, treat as failure.
                if r.status_code in (502, 503, 504):
                    body = (r.text or "")[:800]
                    raise requests.HTTPError(
                        f"{r.status_code} {r.reason} | {body}",
                        response=r,
                    )

                try:
                    r.raise_for_status()
                except requests.HTTPError:
                    body = (r.text or "")[:800]
                    raise requests.HTTPError(
                        f"{r.status_code} {r.reason} | {body}",
                        response=r,
                    )

                content_type = (r.headers.get("content-type") or "").lower()
                if "application/json" in content_type:
                    self.cb.on_success()
                    return r.json()

                text = (r.text or "").strip()
                if text.startswith("{") or text.startswith("["):
                    self.cb.on_success()
                    return r.json()

                self.cb.on_success()
                return text

            except (requests.ConnectionError, requests.Timeout) as e:
                last_exc = e
                self.cb.on_failure()
                if attempt >= self.retries:
                    break
                self._sleep_backoff(attempt)
                continue

            except requests.HTTPError as e:
                last_exc = e
                resp = getattr(e, "response", None)
                code = int(resp.status_code) if resp is not None else 0

                # treat 5xx as breaker failures, 4xx as "real" failures
                if code >= 500:
                    self.cb.on_failure()
                    if attempt < self.retries:
                        self._sleep_backoff(attempt)
                        continue
                raise

            except Exception as e:
                last_exc = e
                self.cb.on_failure()
                raise

        if last_exc is not None:
            raise last_exc
        raise RuntimeError("Request failed")

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        return self.request("POST", path, json=json)
