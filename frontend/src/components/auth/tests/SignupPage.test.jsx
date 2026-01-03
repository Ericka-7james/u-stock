import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach } from "vitest";
import SignupPage from "../SignupPage";

// ✅ mock AppShell so layout changes don't break tests
vi.mock("../../layout/AppShell", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

const mockSignup = vi.fn();

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ signup: mockSignup }),
}));

function renderSignup() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>
  );
}

// helper: fill valid baseline fields
async function fillValidForm(user, overrides = {}) {
  const name = overrides.name ?? "Test User";
  const email = overrides.email ?? "test@example.com";
  const phone = overrides.phone ?? "5555555555"; // optional
  const password = overrides.password ?? "VeryStrongPass1!"; // 16 chars, valid

  await user.type(screen.getByRole("textbox", { name: /name/i }), name);
  await user.type(screen.getByRole("textbox", { name: /email/i }), email);

  // phone is optional; fill only if provided override != null
  if (overrides.phone !== null) {
    await user.type(
      screen.getByPlaceholderText(/\(555\) 555-5555/i),
      phone
    );
  }

  await user.type(screen.getByLabelText(/^password$/i), password);
}

describe("SignupPage validation and behavior", () => {
  beforeEach(() => {
    mockSignup.mockReset();
  });

  test("shows error when name is missing", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByRole("textbox", { name: /email/i }), "test@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "VeryStrongPass1!");

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(await screen.findByText(/please enter your name\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when email is invalid", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByRole("textbox", { name: /name/i }), "Test User");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "bad-email");
    await user.type(screen.getByLabelText(/^password$/i), "VeryStrongPass1!");

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(await screen.findByText(/please enter a valid email address\./i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when phone number has too few digits (if provided)", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByRole("textbox", { name: /name/i }), "Test User");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "test@example.com");
    await user.type(screen.getByPlaceholderText(/\(555\) 555-5555/i), "12345");
    await user.type(screen.getByLabelText(/^password$/i), "VeryStrongPass1!");

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(
      await screen.findByText(/please enter a valid phone number \(10–15 digits\)\./i)
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when password is shorter than 12 characters", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByRole("textbox", { name: /name/i }), "Test User");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "test@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Ab1!short"); // < 12

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(
      await screen.findByText(/password must be at least 12 characters long\./i)
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("calls signup with trimmed values when valid (phone is UI-only)", async () => {
    const user = userEvent.setup();
    renderSignup();

    // valid + with whitespace
    await user.type(screen.getByRole("textbox", { name: /name/i }), "  Test User  ");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "  test@example.com  ");
    await user.type(screen.getByPlaceholderText(/\(555\) 555-5555/i), " (555) 555-5555 ");
    await user.type(screen.getByLabelText(/^password$/i), "VeryStrongPass1!");

    // choose a non-default avatar to prove selection works
    await user.click(screen.getByRole("button", { name: "📊" }));

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));

    expect(mockSignup).toHaveBeenCalledWith({
      username: "Test User",
      email: "test@example.com",
      password: "VeryStrongPass1!",
      avatar: "📊",
    });
  });

  test("shows backend error message when signup throws", async () => {
    const user = userEvent.setup();
    mockSignup.mockRejectedValueOnce(new Error("Backend exploded"));

    renderSignup();
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

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
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    const loadingButton = screen.getByRole("button", { name: /creating account…/i });
    expect(loadingButton).toBeDisabled();

    resolveSignup();
  });
});
