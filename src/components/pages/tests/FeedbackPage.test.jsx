import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isAuthed: false,
  }),
}));

// Mock fetch
global.fetch = vi.fn();

import FeedbackPage from "../FeedbackPage";

describe("FeedbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    );
  }

  it("renders the feedback form and fields", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /feedback/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/feedback type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /send feedback/i })
    ).toBeInTheDocument();
  });

  it("shows validation error if message is empty", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /send feedback/i })
    );

    expect(
      await screen.findByText(/please enter a message/i)
    ).toBeInTheDocument();
  });

  it("submits feedback successfully and shows success message", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Ericka" },
    });

    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "This dashboard is clean — love the UX." },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /send feedback/i })
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(/thanks! your feedback was sent/i)
    ).toBeInTheDocument();
  });

  it("shows server error when submission fails", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Server error" }),
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "Something broke." },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /send feedback/i })
    );

    expect(
      await screen.findByText(/server error/i)
    ).toBeInTheDocument();
  });

  it("allows typing into inputs (smoke test)", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Ericka" },
    });

    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: "test@example.com" },
    });

    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "Feature idea: alerts!" },
    });

    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Ericka");
    expect(screen.getByLabelText(/contact email/i)).toHaveValue("test@example.com");
    expect(screen.getByLabelText(/^message$/i)).toHaveValue("Feature idea: alerts!");
  });
});
