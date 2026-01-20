import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isAuthed: false,
    refreshSession: vi.fn(),
  }),
}));

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

    expect(screen.getByRole("button", { name: /send feedback/i })).toBeInTheDocument();
  });

  it("disables submit until message has at least 3 words", () => {
    renderPage();

    const submit = screen.getByRole("button", { name: /send feedback/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "Too short" }, // 2 words
    });

    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "This is enough" }, // 3 words
    });

    // In tests (import.meta.env.DEV true), captcha shouldn't block
    expect(submit).not.toBeDisabled();
  });

  it("submits feedback successfully and shows success message", async () => {
    // override default fetch mock for this test
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => JSON.stringify({ ok: true }),
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Ericka" },
    });

    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "This dashboard is clean" }, // 4 words
    });

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/sent!\s*thank you/i)).toBeInTheDocument();
  });

  it("shows server error when submission fails", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
      text: async () => JSON.stringify({ detail: "Server error" }),
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "Something broke badly" }, // 3 words
    });

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
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
      target: { value: "Feature idea: alerts now" }, // 4 words
    });

    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Ericka");
    expect(screen.getByLabelText(/contact email/i)).toHaveValue("test@example.com");
    expect(screen.getByLabelText(/^message$/i)).toHaveValue("Feature idea: alerts now");
  });
});
