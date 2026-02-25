import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach } from "vitest";

import SignupPage from "../SignupPage";

// ---- Mocks ----
vi.mock("../../layout/AppShell", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

// Render ErrorModal content in tests when open
vi.mock("../../common/ErrorModal", () => ({
  default: ({ open, error, onClose }) =>
    open ? (
      <div role="dialog" aria-label="error-modal">
        <div>{error?.title}</div>
        <div>{error?.body}</div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

// Make error messages predictable
vi.mock("../../../lib/errorMessages", () => ({
  explainAnyError: (err) => ({
    title: "Error",
    body: String(err?.message || err || "Something went wrong."),
    subtitle: "",
    image: null,
    action: null,
  }),
}));

// Mock content so placeholders + button text are stable
vi.mock("../../../content/landing/signuppage.content.ts", () => ({
  SIGNUP_PAGE_CONTENT: {
    header: { title: "Create account", subtitle: "Join Lucent" },
    fields: {
      usernamePlaceholder: "Username",
      emailPlaceholder: "Email",
      phonePlaceholder: "(555) 555-5555",
      passwordPlaceholder: "Password",
    },
    avatar: { label: "Avatar", options: ["📈", "📊", "🦊"] },
    buttons: {
      submit: "Sign up",
      submitLoading: "Creating account…",
      google: "Continue with Google",
      facebook: "Continue with Facebook",
    },
    divider: { text: "or" },
    footer: { text: "Have an account?", linkText: "Log in" },
  },
}));

const mockSignup = vi.fn();
const mockSignupWithGoogle = vi.fn();
const mockSignupWithFacebook = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    signup: mockSignup,
    signupWithGoogle: mockSignupWithGoogle,
    signupWithFacebook: mockSignupWithFacebook,
  }),
}));

function renderSignup() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>
  );
}

async function fillBaseValid(user, overrides = {}) {
  const name = overrides.name ?? "Test User";
  const email = overrides.email ?? "test@example.com";
  const phone = overrides.phone; // undefined => do not type; null => type nothing
  const password = overrides.password ?? "VeryStrongPass1!";

  await user.type(screen.getByPlaceholderText("Username"), name);
  await user.type(screen.getByPlaceholderText("Email"), email);

  if (phone !== undefined) {
    await user.type(screen.getByPlaceholderText("(555) 555-5555"), phone ?? "");
  }

  await user.type(screen.getByPlaceholderText("Password"), password);
}

describe("SignupPage validation and behavior", () => {
  beforeEach(() => {
    mockSignup.mockReset();
    mockSignupWithGoogle.mockReset();
    mockSignupWithFacebook.mockReset();
    mockNavigate.mockReset();
  });

  test("shows error when username is missing", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByPlaceholderText("Email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "VeryStrongPass1!");

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText(/please enter your username\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when email is invalid", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByPlaceholderText("Username"), "Test User");
    await user.type(screen.getByPlaceholderText("Email"), "bad-email");
    await user.type(screen.getByPlaceholderText("Password"), "VeryStrongPass1!");

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText(/please enter a valid email address\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("phone is optional (blank phone should not block submit)", async () => {
    const user = userEvent.setup();
    renderSignup();

    mockSignup.mockResolvedValueOnce();

    // don't touch phone at all
    await fillBaseValid(user, { phone: undefined });

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
    expect(mockSignup.mock.calls[0][0].phone).toBeNull();
  });

  test("shows error when phone number has too few digits (if provided)", async () => {
    const user = userEvent.setup();
    renderSignup();

    await fillBaseValid(user, {
      name: "Test User",
      email: "test@example.com",
      phone: "12345",
      password: "VeryStrongPass1!",
    });

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText(/please enter a valid phone number \(10–15 digits\)\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("accepts formatted phone as long as digits count is valid", async () => {
    const user = userEvent.setup();
    renderSignup();

    mockSignup.mockResolvedValueOnce();

    await fillBaseValid(user, { phone: " (555) 555-5555 " });

    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));

    // SignupPage normalizes to digits-only string
    expect(mockSignup.mock.calls[0][0].phone).toBe("5555555555");
  });

  test("shows error when password is shorter than 12 characters", async () => {
    const user = userEvent.setup();
    renderSignup();

    await fillBaseValid(user, {
      password: "Ab1!short", // < 12
      phone: undefined,
    });

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText(/password must be at least 12 characters long\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("rejects password that contains the email local-part", async () => {
    const user = userEvent.setup();
    renderSignup();

    await fillBaseValid(user, {
      name: "Test User",
      email: "karen@example.com",
      phone: undefined,
      password: "MyKarenPassword1!",
    });

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText(/password must not contain your email\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("rejects password that contains the username", async () => {
    const user = userEvent.setup();
    renderSignup();

    await fillBaseValid(user, {
      name: "Ericka",
      email: "test@example.com",
      phone: undefined,
      password: "ErickaIsGreat1!",
    });

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText(/password must not contain your username\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("calls signup with trimmed/normalized values when valid", async () => {
    const user = userEvent.setup();
    renderSignup();

    mockSignup.mockResolvedValueOnce();

    await user.type(screen.getByPlaceholderText("Username"), "  Test User  ");
    await user.type(screen.getByPlaceholderText("Email"), "  TEST@EXAMPLE.COM  ");
    await user.type(screen.getByPlaceholderText("(555) 555-5555"), " (555) 555-5555 ");
    await user.type(screen.getByPlaceholderText("Password"), "VeryStrongPass1!");

    // choose a non-default avatar
    await user.click(screen.getByRole("button", { name: "📊" }));

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));

    expect(mockSignup).toHaveBeenCalledWith({
      username: "Test User",
      email: "test@example.com",
      phone: "5555555555",
      password: "VeryStrongPass1!",
      avatar: "📊",
    });

    // flow: signup -> then sign in
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  test("default avatar remains 📈 if user doesn't change it", async () => {
    const user = userEvent.setup();
    renderSignup();

    mockSignup.mockResolvedValueOnce();

    await fillBaseValid(user, { phone: undefined });
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
    expect(mockSignup.mock.calls[0][0].avatar).toBe("📈");
  });

  test("shows backend error message when signup throws", async () => {
    const user = userEvent.setup();
    mockSignup.mockRejectedValueOnce(new Error("Backend exploded"));

    renderSignup();
    await fillBaseValid(user, { phone: undefined });

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("dialog", { name: "error-modal" })).toBeInTheDocument();
    expect(await screen.findByText(/backend exploded/i)).toBeInTheDocument();
  });

  test("shows loading state while signup is in progress", async () => {
    const user = userEvent.setup();

    let resolveSignup;
    mockSignup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignup = resolve;
        })
    );

    renderSignup();
    await fillBaseValid(user, { phone: undefined });

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    const loadingButton = screen.getByRole("button", { name: "Creating account…" });
    expect(loadingButton).toBeDisabled();

    resolveSignup();
  });
});