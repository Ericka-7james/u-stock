// src/components/auth/tests/SignupPage.test.jsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import SignupPage from "../SignupPage";

// mock signup from AuthContext so we don't hit real auth
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

describe("SignupPage validation and behavior", () => {
  beforeEach(() => {
    mockSignup.mockReset();
  });

  test("shows error when name is missing", async () => {
    const user = userEvent.setup();
    renderSignup();

    // leave name blank
    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/phone number/i), "(555)555-5555");
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1!"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(/please enter your name\./i)
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when email is invalid", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(screen.getByLabelText(/email/i), "bad-email");
    await user.type(screen.getByLabelText(/phone number/i), "5555555555");
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1!"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(/please enter a valid email address\./i)
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when phone number has too few digits", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(
      screen.getByLabelText(/email/i),
      "test@example.com"
    );
    await user.type(screen.getByLabelText(/phone number/i), "12345");
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1!"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(
        /please enter a valid phone number \(10–15 digits\)\./i
      )
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when phone number has too many digits", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(
      screen.getByLabelText(/email/i),
      "test@example.com"
    );
    await user.type(
      screen.getByLabelText(/phone number/i),
      "1234567890123456"
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1!"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(
        /please enter a valid phone number \(10–15 digits\)\./i
      )
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when password is shorter than 8 characters", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(
      screen.getByLabelText(/email/i),
      "test@example.com"
    );
    await user.type(
      screen.getByLabelText(/phone number/i),
      "5555555555"
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Ab1!" // 4 chars
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(
        /password must be at least 8 characters long\./i
      )
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("shows error when password has no special character", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(
      screen.getByLabelText(/email/i),
      "test@example.com"
    );
    await user.type(
      screen.getByLabelText(/phone number/i),
      "5555555555"
    );
    // 9 chars, no special character → triggers special char error
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(
        /password must include at least one special character\./i
      )
    ).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test("calls signup with trimmed values when all inputs are valid", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "  Test User  ");
    await user.type(
      screen.getByLabelText(/email/i),
      "  test@example.com  "
    );
    await user.type(
      screen.getByLabelText(/phone number/i),
      " (555) 555-5555 "
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1!"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledTimes(1);
    });

    expect(mockSignup).toHaveBeenCalledWith({
      name: "Test User",
      email: "test@example.com",
      phone: "(555) 555-5555",
      password: "Password1!",
      avatar: expect.any(String),
    });
  });

  test("shows backend error message when signup throws", async () => {
    const user = userEvent.setup();
    mockSignup.mockRejectedValueOnce(new Error("Backend exploded"));

    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(
      screen.getByLabelText(/email/i),
      "test@example.com"
    );
    await user.type(
      screen.getByLabelText(/phone number/i),
      "5555555555"
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1!"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(/backend exploded/i)
    ).toBeInTheDocument();
  });

  test("shows loading state while signup is in progress", async () => {
    let resolveSignup;
    mockSignup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignup = resolve;
        })
    );

    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(
      screen.getByLabelText(/email/i),
      "test@example.com"
    );
    await user.type(
      screen.getByLabelText(/phone number/i),
      "5555555555"
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Password1!"
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    // Button should switch to "Creating account…" and be disabled
    const loadingButton = screen.getByRole("button", {
      name: /creating account…/i,
    });
    expect(loadingButton).toBeDisabled();

    // Resolve the promise to avoid hanging
    resolveSignup();
  });
});
