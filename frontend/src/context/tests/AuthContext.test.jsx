// src/context/tests/AuthContext.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AuthProvider, useAuth } from "../AuthContext.jsx";

// ✅ IMPORTANT: mock BOTH exports used by AuthContext
vi.mock("../../config/config", () => ({
  API_BASE: "http://test-api.local",
  API_PREFIX: "", // AuthContext builds `${API_BASE}${API_PREFIX}/auth/...`
}));

function Consumer() {
  const { user, loading, isAuthed, login, signup, logout, refreshSession } =
    useAuth();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="isAuthed">{String(isAuthed)}</div>
      <div data-testid="user">{user ? JSON.stringify(user) : "null"}</div>

      <button onClick={() => refreshSession()} type="button">
        refresh
      </button>

      <button onClick={() => login("test@example.com", "pw")} type="button">
        login
      </button>

      <button
        onClick={() =>
          signup({
            username: "Ericka",
            email: "ericka@example.com",
            password: "pw",
            avatar: "📈",
          })
        }
        type="button"
      >
        signup
      </button>

      <button onClick={() => logout()} type="button">
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
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("useAuth throws if used outside AuthProvider", () => {
    function BadConsumer() {
      useAuth();
      return null;
    }

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadConsumer />)).toThrow(
      /useAuth must be used inside AuthProvider/i
    );
    spy.mockRestore();
  });

  it("on mount: calls /auth/me with credentials include and does not set Content-Type for GET", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    renderWithProvider();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const meCall = global.fetch.mock.calls.find(
      ([url, opts]) =>
        url === "http://test-api.local/auth/me" &&
        (opts?.method || "GET").toUpperCase() === "GET"
    );
    expect(meCall).toBeTruthy();

    const [url, options] = meCall;

    expect(url).toBe("http://test-api.local/auth/me");
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");

    // IMPORTANT: GET should not force JSON content-type
    const headers = options.headers;
    if (headers) {
      const ct =
        headers instanceof Headers
          ? headers.get("Content-Type")
          : headers["Content-Type"];
      expect(ct).toBeFalsy();
    }

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
      expect(screen.getByTestId("isAuthed").textContent).toBe("false");
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });

  it("refreshSession: when /auth/me ok, sets isAuthed true and stores user_id into user.id", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user_id: 123 }),
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("isAuthed").textContent).toBe("true");
    expect(screen.getByTestId("user").textContent).toMatch(/"id":123/);
  });

  it("login: POSTs to /auth/login with JSON body + credentials, then calls /auth/me", async () => {
    // 1) mount /auth/me: not authed
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    // 2) POST /auth/login: ok
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 9, email: "test@example.com" } }),
    });

    // 3) refreshSession /auth/me after login: ok with user_id
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user_id: 9 }),
    });

    // 4) safety: if Safari fallback retry triggers, return ok again
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user_id: 9 }),
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      // mount me + login + refresh me (+ optional retry)
      expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    // ✅ find the /auth/login call (do NOT assume index)
    const loginCall = global.fetch.mock.calls.find(
      ([url, opts]) =>
        url === "http://test-api.local/auth/login" &&
        (opts?.method || "GET").toUpperCase() === "POST"
    );
    expect(loginCall).toBeTruthy();

    const [loginUrl, loginOptions] = loginCall;
    expect(loginUrl).toBe("http://test-api.local/auth/login");
    expect(loginOptions.credentials).toBe("include");

    // Ensure JSON header exists for POST with body
    const loginHeaders = loginOptions.headers;
    const loginCt =
      loginHeaders instanceof Headers
        ? loginHeaders.get("Content-Type")
        : loginHeaders?.["Content-Type"];
    expect(loginCt).toMatch(/application\/json/i);

    expect(loginOptions.body).toBe(
      JSON.stringify({ email: "test@example.com", password: "pw" })
    );

    // ✅ ensure /auth/me was called at least twice (mount + post-login refresh)
    const meCalls = global.fetch.mock.calls.filter(
      ([url]) => url === "http://test-api.local/auth/me"
    );
    expect(meCalls.length).toBeGreaterThanOrEqual(2);

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("true");
      expect(screen.getByTestId("user").textContent).toMatch(/"id":9/);
    });
  });

  it("signup: POSTs to /auth/signup and then calls /auth/me", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) }) // mount /auth/me
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 77, email: "ericka@example.com", avatar: "📈" },
        }),
      }) // POST /auth/signup
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: 77 }) }) // refresh /auth/me
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: 77 }) }); // safety retry

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    fireEvent.click(screen.getByRole("button", { name: "signup" }));

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    const signupCall = global.fetch.mock.calls.find(
      ([url, opts]) =>
        url === "http://test-api.local/auth/signup" &&
        (opts?.method || "GET").toUpperCase() === "POST"
    );
    expect(signupCall).toBeTruthy();

    const [signupUrl, signupOptions] = signupCall;
    expect(signupUrl).toBe("http://test-api.local/auth/signup");
    expect(signupOptions.credentials).toBe("include");

    const signupHeaders = signupOptions.headers;
    const signupCt =
      signupHeaders instanceof Headers
        ? signupHeaders.get("Content-Type")
        : signupHeaders?.["Content-Type"];
    expect(signupCt).toMatch(/application\/json/i);

    await waitFor(() => {
      // After refreshSession, user.id should be set
      expect(screen.getByTestId("user").textContent).toMatch(/"id":77/);
    });
  });

  it("logout: POSTs to /auth/logout and clears user + isAuthed", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: 5 }) }) // mount /auth/me
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // POST /auth/logout

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const logoutCall = global.fetch.mock.calls.find(
      ([url, opts]) =>
        url === "http://test-api.local/auth/logout" &&
        (opts?.method || "GET").toUpperCase() === "POST"
    );
    expect(logoutCall).toBeTruthy();

    const [logoutUrl, logoutOptions] = logoutCall;
    expect(logoutUrl).toBe("http://test-api.local/auth/logout");
    expect(logoutOptions.credentials).toBe("include");

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("false");
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });
});
