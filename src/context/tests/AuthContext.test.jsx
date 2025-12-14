import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AuthProvider, useAuth } from "../AuthContext.jsx";

// Make API_BASE stable for tests
vi.mock("../../config/config", () => ({
  API_BASE: "http://test-api.local",
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

      <button
        onClick={() => login("test@example.com", "pw")}
        type="button"
      >
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
      useAuth(); // should throw
      return null;
    }

    // suppress React error spam in test output
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<BadConsumer />)).toThrow(
      /useAuth must be used inside AuthProvider/i
    );

    spy.mockRestore();
  });

  it("on mount: calls /auth/me with credentials include and does not set Content-Type for GET", async () => {
    // /auth/me returns 401 -> not authed
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    renderWithProvider();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = global.fetch.mock.calls[0];

    expect(url).toBe("http://test-api.local/auth/me");
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");

    // IMPORTANT: GET should not force JSON content-type
    // (headers may be undefined or a Headers instance)
    const headers = options.headers;
    if (headers) {
      const ct =
        headers instanceof Headers ? headers.get("Content-Type") : headers["Content-Type"];
      expect(ct).toBeFalsy();
    }

    // final state
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
      expect(screen.getByTestId("isAuthed").textContent).toBe("false");
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });

  it("refreshSession: when /auth/me ok, sets isAuthed true and stores user_id into user.id", async () => {
    // mount refresh: ok true
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
    // mount /auth/me: not authed
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    // login POST /auth/login: ok
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 9, email: "test@example.com" } }),
    });

    // refreshSession /auth/me after login: ok with user_id
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
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    // call 2 is /auth/login
    const [loginUrl, loginOptions] = global.fetch.mock.calls[1];
    expect(loginUrl).toBe("http://test-api.local/auth/login");
    expect(loginOptions.method).toBe("POST");
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

    // call 3 is /auth/me again
    const [meUrl2, meOptions2] = global.fetch.mock.calls[2];
    expect(meUrl2).toBe("http://test-api.local/auth/me");
    expect(meOptions2.credentials).toBe("include");

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("true");
      expect(screen.getByTestId("user").textContent).toMatch(/"id":9/);
    });
  });

  it("signup: POSTs to /auth/signup and then calls /auth/me", async () => {
    // mount /auth/me: not authed
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    // signup POST: ok
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 77, email: "ericka@example.com", avatar: "📈" },
      }),
    });

    // refreshSession /auth/me after signup: ok
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user_id: 77 }),
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    fireEvent.click(screen.getByRole("button", { name: "signup" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    const [signupUrl, signupOptions] = global.fetch.mock.calls[1];
    expect(signupUrl).toBe("http://test-api.local/auth/signup");
    expect(signupOptions.method).toBe("POST");
    expect(signupOptions.credentials).toBe("include");

    const signupHeaders = signupOptions.headers;
    const signupCt =
      signupHeaders instanceof Headers
        ? signupHeaders.get("Content-Type")
        : signupHeaders?.["Content-Type"];
    expect(signupCt).toMatch(/application\/json/i);

    await waitFor(() => {
      // signup does not force isAuthed true by itself, but refreshSession can.
      expect(screen.getByTestId("user").textContent).toMatch(/"id":77/);
    });
  });

  it("logout: POSTs to /auth/logout and clears user + isAuthed", async () => {
    // mount /auth/me: authed initially
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user_id: 5 }),
    });

    // logout POST
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    const [logoutUrl, logoutOptions] = global.fetch.mock.calls[1];
    expect(logoutUrl).toBe("http://test-api.local/auth/logout");
    expect(logoutOptions.method).toBe("POST");
    expect(logoutOptions.credentials).toBe("include");

    await waitFor(() => {
      expect(screen.getByTestId("isAuthed").textContent).toBe("false");
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });
});
