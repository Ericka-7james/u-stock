import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext so NavBar/AppShell can call useAuth safely
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

import FeedbackPage from "../FeedbackPage";

describe("FeedbackPage", () => {
  let alertSpy;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    );
  }

  it("renders the feedback header and core fields", () => {
    renderPage();

    // Heading
    expect(
      screen.getByRole("heading", { name: /^feedback$/i })
    ).toBeInTheDocument();

    // Subtitle text
    expect(
      screen.getByText(/share ideas, report issues, or ask questions/i)
    ).toBeInTheDocument();

    // Fields
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/feedback type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument();

    // Buttons
    expect(
      screen.getByRole("button", { name: /send feedback/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancel/i })
    ).toBeInTheDocument();
  });

  it("shows an alert when the form is submitted", () => {
    renderPage();

    // submit the form (more accurate than only clicking the button)
    const form = screen.getByLabelText(/^name$/i).closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("Feedback submission is coming soon!");
  });

  it("does not submit when Cancel is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("lets the user type into the inputs (smoke test)", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Ericka" },
    });
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "Love the dashboard — add backtests next!" },
    });

    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Ericka");
    expect(screen.getByLabelText(/contact email/i)).toHaveValue("test@example.com");
    expect(screen.getByLabelText(/^message$/i)).toHaveValue(
      "Love the dashboard — add backtests next!"
    );
  });
});
