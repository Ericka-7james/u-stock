import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

  test("calls login with trimmed email and password on submit", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce();

    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "  test@example.com  ");
    await user.type(screen.getByPlaceholderText(/password/i), "MySecretPass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(mockLogin).toHaveBeenCalledWith("test@example.com", "MySecretPass!");
  });

  test("shows backend error message when login fails", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "wrongpass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  test("shows fallback error when login throws without a message", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({});

    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "wrongpass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));

    expect(await screen.findByText(/unable to sign in/i)).toBeInTheDocument();
  });

  test("clears previous error on a new submit attempt", async () => {
    const user = userEvent.setup();

    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));
    renderAuth();

    await user.type(screen.getByPlaceholderText(/email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "wrongpass!");

    await user.click(screen.getByRole("button", { name: /sign in →/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();

    // next attempt should clear error immediately
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
