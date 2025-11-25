// src/components/dashboard/DashboardPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";

vi.mock("../../hooks/raw/useSignalsSnapshot", () => ({
  useSignalsSnapshot: () => ({
    data: [
      {
        ticker: "AAPL",
        score: 4.2,
        components: {
          daily: { close_return_1d: 0.02 },
          intraday: { intraday_return: 0.01 },
          multiday: { return_5d: 0.05 },
        },
      },
    ],
    meta: {
      generatedAt: "2025-11-24T12:00:00Z",
      universe: ["AAPL"],
      rankingDescription: "Mock ranking description",
    },
    loading: false,
  }),
}));

vi.mock("../../hooks/raw/useDailyPricesHistory", () => ({
  useDailyPricesHistory: () => ({
    historyBySymbol: { AAPL: [] },
    symbols: ["AAPL"],
    meta: { generatedAt: "2025-11-24T12:00:00Z" },
    loading: false,
  }),
}));

describe("DashboardPage", () => {
  it("renders top stats + chart container", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    // Stats card labels – allow multiple matches
    const universeLabels = screen.getAllByText(/Universe size/i);
    expect(universeLabels.length).toBeGreaterThanOrEqual(1);

    expect(
      screen.getByText(/Top in-play ticker/i)
    ).toBeInTheDocument();

    // Chart area
    expect(
      screen.getByText(/Price action viewer/i)
    ).toBeInTheDocument();

    // Ticker select exists
    expect(screen.getByLabelText(/Ticker/i)).toBeInTheDocument();
  });
});
