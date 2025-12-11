// src/components/pages/tests/FeedbackPage.test.jsx
import { describe, it, expect, vi } from "vitest";
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
  it("renders the feedback header and core fields", () => {
    render(
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    );

    // Heading
    expect(
      screen.getByRole("heading", { name: /feedback/i })
    ).toBeInTheDocument();

    // Name field
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();

    // Contact email field
    expect(screen.getByLabelText(/contact email/i)).toBeInTheDocument();

    // Feedback type select
    expect(screen.getByLabelText(/feedback type/i)).toBeInTheDocument();

    // Message textarea
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();

    // Primary action button
    expect(
      screen.getByRole("button", { name: /send feedback/i })
    ).toBeInTheDocument();

    // Cancel button
    expect(
      screen.getByRole("button", { name: /cancel/i })
    ).toBeInTheDocument();
  });

  it("shows an alert when the form is submitted", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    );

    const sendButton = screen.getByRole("button", {
      name: /send feedback/i,
    });

    // Click primary submit button
    fireEvent.click(sendButton);

    expect(alertSpy).toHaveBeenCalledWith(
      "Feedback submission is coming soon!"
    );

    alertSpy.mockRestore();
  });

  it("does not submit when Cancel is clicked", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });

    // Cancel is type="button", so submit handler shouldn't fire
    fireEvent.click(cancelButton);

    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
