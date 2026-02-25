// src/components/auth/tests/AuthPage.test.jsx
import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach } from "vitest";
import AuthPage from "../AuthPage";

// --- Mocks ---
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../../layout/AppShell", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

// ✅ Make ErrorModal assertable (your AuthPage now uses centralized modal errors)
vi.mock("../../common/ErrorModal", () => ({
  default: ({ open, error, onClose, onAction }) =>
    open ? (
      <div role="dialog" aria-label="error-modal">
        <div>{error?.title}</div>
        <div>{error?.body}</div>
        {error?.subtitle ? <div>{error.subtitle}</div> : null}

        {error?.action?.label ? (
          <button type="button" onClick={() => onAction?.(error.action)}>
            {error.action.label}
          </button>
        ) : null}

        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isAuthed: false,
    loading: false,
    login: mockLogin,
    logout: vi.fn(),
    authFetch: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ✅ Keep copy stable so tests don't depend on changing content files
vi.mock("../../../content/landing/authpage.content.ts", () => ({
  AUTH_PAGE_COPY: {
    left: {
      title: "Welcome back",
      fields: {
        emailPlaceholder: "Email",
        passwordPlaceholder: "Password",
      },
      submit: {
        idle: "Sign in →",
        loading: "Signing in…",
      },
      alt: {
        prefix: "New here?",
        cta: "Create an account →",
      },
    },
    right: {
      title: "U-Stock Radar Suite",
      description: "Log in to see your market dashboard",
      cta: "Sign Up",
    },
    errors: {
      fallback: "Unable to sign in",
    },
  },
}));

// ✅ Make explainAnyError deterministic (maps unknown errors to fallback)
vi.mock("../../../lib/errorMessages", () => ({
  explainAnyError: (anyErr, { feature } = {}) => {
    const msg =
      anyErr && typeof anyErr === "object" && "message" in anyErr && anyErr.message
        ? anyErr.message
        : typeof anyErr === "string"
        ? anyErr
        : null;

    return {
      title: feature === "login" ? "Sign in failed" : "Error",
      body: msg || "Unable to sign in",
      subtitle: "",
      image: null,
      action: null,
    };
  },
}));

function renderAuth() {
  return render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>
  );
}

describe("AuthPage", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockNavigate.mockReset();
  });

  test("renders the login form and right-hand panel", () => {
    renderAuth();

    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();

    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /sign in →/i })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /u-stock radar suite/i })).toBeInTheDocument();
    expect(screen.getByText(/log in to see your market dashboard/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign up$/i })).toBeInTheDocument();
  });

  test("calls login with normalized email (trim + lowercase) and password on submit", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce();

    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "  TEST@Example.com  ");
    await user.type(screen.getByPlaceholderText(/password/i), "MySecretPass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(mockLogin).toHaveBeenCalledWith("test@example.com", "MySecretPass!");
  });

  test("shows backend error message in ErrorModal when login fails", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "wrongpass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    const modal = await screen.findByRole("dialog", { name: /error-modal/i });
    expect(modal).toBeInTheDocument();

    const m = within(modal);
    expect(m.getByText(/invalid credentials/i)).toBeInTheDocument();
  });

  test("shows fallback error when login throws without a message", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({});

    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "wrongpass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    const modal = await screen.findByRole("dialog", { name: /error-modal/i });
    expect(modal).toBeInTheDocument();

    const m = within(modal);
    expect(m.getByText(/unable to sign in/i)).toBeInTheDocument();
  });

  test("clears previous modal error on a new submit attempt", async () => {
    const user = userEvent.setup();

    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));
    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "wrongpass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();

    // close modal (represents user dismissing it)
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog", { name: /error-modal/i })).not.toBeInTheDocument();

    // next attempt: should not instantly show old error
    mockLogin.mockResolvedValueOnce();
    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
  });

  test("shows loading state while login is in progress", async () => {
    const user = userEvent.setup();
    let resolveLogin;
    mockLogin.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );

    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "MySecretPass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    const loadingButton = screen.getByRole("button", { name: /signing in…/i });
    expect(loadingButton).toBeDisabled();

    resolveLogin();
  });

  test('clicking "Create an account →" navigates to /auth/signup', async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole("button", { name: /create an account →/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth/signup");
  });

  test('clicking right-panel "Sign Up" navigates to /auth/signup', async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth/signup");
  });
});