// src/context/tests/AuthContext.test.jsx
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AuthProvider, useAuth } from "../AuthContext.jsx";

// ✅ IMPORTANT: mock BOTH exports used by AuthContext
vi.mock("../../config/config", () => ({
  API_BASE: "http://test-api.local",
  API_PREFIX: "", // AuthContext builds `${API_BASE}${API_PREFIX}/auth/...`
}));

const SESSION_HINT_KEY = "ustock_session_hint_v1";

function jsonResponse(obj, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: () => "application/json" },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  });
}

/**
 * Test Consumer
 * ✅ Wrap all async context calls in try/catch so failures don't become unhandled rejections.
 */
function Consumer() {
  const { user, loading, isAuthed, login, signup, logout, refreshSession } = useAuth();
  const [err, setErr] = useState("");

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="isAuthed">{String(isAuthed)}</div>
      <div data-testid="user">{user ? JSON.stringify(user) : "null"}</div>
      <div data-testid="err">{err || ""}</div>

      <button
        onClick={async () => {
          setErr("");
          try {
            await refreshSession();
          } catch (e) {
            setErr(String(e?.message || e));
          }
        }}
        type="button"
      >
        refresh
      </button>

      <button
        onClick={async () => {
          setErr("");
          try {
            await login("test@example.com", "pw");
          } catch (e) {
            setErr(String(e?.message || e));
          }
        }}
        type="button"
      >
        login
      </button>

      <button
        onClick={async () => {
          setErr("");
          try {
            await signup({
              username: "Ericka",
              email: "ericka@example.com",
              password: "pw",
              avatar: "📈",
            });
          } catch (e) {
            setErr(String(e?.message || e));
          }
        }}
        type="button"
      >
        signup
      </button>

      <button
        onClick={async () => {
          setErr("");
          try {
            await logout();
          } catch (e) {
            setErr(String(e?.message || e));
          }
        }}
        type="button"
      >
        logout
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

describe("AuthContext", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("useAuth throws if used outside AuthProvider", () => {
    function BadConsumer() {
      useAuth();
      return null;
    }

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadConsumer />)).toThrow(/useAuth must be used inside AuthProvider/i);
    spy.mockRestore();
  });

  it("on mount: WITHOUT session hint, does NOT call /auth/me and ends loading=false", async () => {
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("isAuthed").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  it("on mount: WITH session hint, calls /auth/me with credentials include and does not set Content-Type for GET", async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, "1");

    globalThis.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();

      if (url === "http://test-api.local/auth/me" && method === "GET") {
        return jsonResponse({}, false, 401);
      }

      return jsonResponse({ detail: "Unhandled route in test", url }, false, 500);
    });

    renderWithProvider();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const meCall = globalThis.fetch.mock.calls.find(
      ([url, opts]) =>
        url === "http://test-api.local/auth/me" && (opts?.method || "GET").toUpperCase() === "GET"
    );
    expect(meCall).toBeTruthy();

    const [url, options] = meCall;

    expect(url).toBe("http://test-api.local/auth/me");
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");

    const headers = options.headers;
    if (headers) {
      const ct = headers instanceof Headers ? headers.get("Content-Type") : headers["Content-Type"];
      expect(ct).toBeFalsy();
    }

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
      expect(screen.getByTestId("isAuthed").textContent).toBe("false");
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });

  it("refreshSession: when forced /auth/me ok, sets isAuthed true and stores user_id into user.id", async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, "1");

    globalThis.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();
      if (url === "http://test-api.local/auth/me" && method === "GET") {
        return jsonResponse({ user_id: 123 }, true, 200);
      }
      return jsonResponse({ detail: "Unhandled route in test", url }, false, 500);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("isAuthed").textContent).toBe("true");
    expect(screen.getByTestId("user").textContent).toMatch(/"id":123/);
  });

  it("login: POSTs to /auth/login with JSON body + credentials, then calls /auth/me", async () => {
    globalThis.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();

      if (url === "http://test-api.local/auth/login" && method === "POST") {
        return jsonResponse({ user: { id: 9, email: "test@example.com" } }, true, 200);
      }

      if (url === "http://test-api.local/auth/me" && method === "GET") {
        return jsonResponse({ user_id: 9 }, true, 200);
      }

      return jsonResponse({ detail: "Unhandled route in test", url }, false, 500);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      const loginCall = globalThis.fetch.mock.calls.find(
        ([url, opts]) =>
          url === "http://test-api.local/auth/login" &&
          (opts?.method || "GET").toUpperCase() === "POST"
      );
      expect(loginCall).toBeTruthy();
    });

    const loginCall = globalThis.fetch.mock.calls.find(
      ([url, opts]) =>
        url === "http://test-api.local/auth/login" && (opts?.method || "GET").toUpperCase() === "POST"
    );
    const [, loginOptions] = loginCall;

    expect(loginOptions.credentials).toBe("include");

    const loginHeaders = loginOptions.headers;
    const loginCt =
      loginHeaders instanceof Headers ? loginHeaders.get("Content-Type") : loginHeaders?.["Content-Type"];
    expect(loginCt).toMatch(/application\/json/i);

    expect(loginOptions.body).toBe(JSON.stringify({ email: "test@example.com", password: "pw" }));

    await waitFor(() => {
      const meCalls = globalThis.fetch.mock.calls.filter(([url]) => url === "http://test-api.local/auth/me");
      expect(meCalls.length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("true");
      expect(screen.getByTestId("user").textContent).toMatch(/"id":9/);
      expect(screen.getByTestId("err").textContent).toBe("");
    });
  });

  it("signup: POSTs to /auth/signup and then calls /auth/me", async () => {
    globalThis.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();

      if (url === "http://test-api.local/auth/signup" && method === "POST") {
        return jsonResponse({ user: { id: 77, email: "ericka@example.com", avatar: "📈" } }, true, 200);
      }

      if (url === "http://test-api.local/auth/me" && method === "GET") {
        return jsonResponse({ user_id: 77 }, true, 200);
      }

      return jsonResponse({ detail: "Unhandled route in test", url }, false, 500);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByRole("button", { name: "signup" }));

    await waitFor(() => {
      const signupCall = globalThis.fetch.mock.calls.find(
        ([url, opts]) =>
          url === "http://test-api.local/auth/signup" &&
          (opts?.method || "GET").toUpperCase() === "POST"
      );
      expect(signupCall).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("true");
      expect(screen.getByTestId("user").textContent).toMatch(/"id":77/);
      expect(screen.getByTestId("err").textContent).toBe("");
    });
  });

  it("logout: POSTs to /auth/logout and clears user + isAuthed", async () => {
    let authed = true;

    globalThis.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();

      if (url === "http://test-api.local/auth/me" && method === "GET") {
        return authed ? jsonResponse({ user_id: 5 }, true, 200) : jsonResponse({}, false, 401);
      }

      if (url === "http://test-api.local/auth/logout" && method === "POST") {
        authed = false;
        return jsonResponse({}, true, 200);
      }

      return jsonResponse({ detail: "Unhandled route in test", url }, false, 500);
    });

    window.localStorage.setItem(SESSION_HINT_KEY, "1");

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
      expect(screen.getByTestId("isAuthed").textContent).toBe("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => {
      const logoutCall = globalThis.fetch.mock.calls.find(
        ([url, opts]) =>
          url === "http://test-api.local/auth/logout" &&
          (opts?.method || "GET").toUpperCase() === "POST"
      );
      expect(logoutCall).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("false");
      expect(screen.getByTestId("user").textContent).toBe("null");
      expect(screen.getByTestId("err").textContent).toBe("");
    });
  });
});