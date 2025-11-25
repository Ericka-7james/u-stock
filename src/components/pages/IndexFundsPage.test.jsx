import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import IndexFundsPage from "./IndexFundsPage";

// Vitest mock (NOT jest.mock)
import { vi } from "vitest";

// Mock the fundamentals hook
vi.mock("../../hooks/raw/useFundamentalsSnapshot", () => ({
  useFundamentalsSnapshot: vi.fn(),
}));

import { useFundamentalsSnapshot } from "../../hooks/raw/useFundamentalsSnapshot";

describe("IndexFundsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the about tab by default", () => {
    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: false,
      meta: null,
    });

    render(
      <MemoryRouter>
        <IndexFundsPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", {
        name: /index funds & quant foundations/i,
      })
    ).toBeInTheDocument();
  });

  it("shows loading message when switching to Funds tab", () => {
    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: true,
      meta: null,
    });

    render(
      <MemoryRouter>
        <IndexFundsPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /funds in this snapshot/i })
    );

    expect(
      screen.getByText(/loading fundamentals snapshot/i)
    ).toBeInTheDocument();
  });

  it("renders fund cards when data is present", () => {
    useFundamentalsSnapshot.mockReturnValue({
      loading: false,
      meta: { generatedAt: "2025-11-24T12:00:00Z" },
      data: [
        {
          ticker: "VTI",
          pe: 20.1234,
          marketCap: 1500000000,
        },
      ],
    });

    render(
      <MemoryRouter>
        <IndexFundsPage />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /funds in this snapshot/i })
    );

    expect(screen.getByText("VTI")).toBeInTheDocument();
    expect(screen.getByText("20.1")).toBeInTheDocument();
    expect(screen.getByText("1.5B")).toBeInTheDocument();
  });
});
