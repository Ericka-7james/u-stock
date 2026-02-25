// frontend/src/components/dashboard/tests/StatSummary.test.jsx
import React from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * StatSummary imports:
 *   "../../lib/format/datetime.js"
 *
 * From THIS test file location (src/components/dashboard/tests),
 * that resolves to:
 *   "../../../lib/format/datetime.js"
 *
 * Mock that resolved path so the named imports exist.
 */
vi.mock("../../../lib/format/datetime.js", () => {
  const toValidDate = (x) => {
    if (!x) return null;
    const d = new Date(x);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const maxDate = (dates) => {
    const ds = (Array.isArray(dates) ? dates : []).filter(Boolean);
    if (!ds.length) return null;
    return ds.reduce((best, d) => (d.getTime() > best.getTime() ? d : best), ds[0]);
  };

  return {
    toValidDate,
    maxDate,
    fmtTimeHHMM: () => "12:00",
    fmtDateShort: () => "1/1/2024",
  };
});

// Correct import for the actual file you showed:
// frontend/src/components/dashboard/StatSummary.jsx
import StatSummary from "../StatSummary.jsx";

describe("StatSummary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders fallback values when signals + meta are empty", () => {
    render(<StatSummary signalsMeta={null} signalsData={null} pricesMeta={null} priceSymbols={[]} />);

    const signalsCard = screen.getByText(/signals universe/i).closest(".stat-card");
    expect(signalsCard).not.toBeNull();
    expect(within(signalsCard).getByText("0")).toBeInTheDocument();

    const pricesCard = screen.getByText(/price coverage/i).closest(".stat-card");
    expect(pricesCard).not.toBeNull();
    expect(within(pricesCard).getByText("0")).toBeInTheDocument();

    const refreshCard = screen.getByText(/last data refresh/i).closest(".stat-card");
    expect(refreshCard).not.toBeNull();
    expect(within(refreshCard).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(refreshCard).getByText(/run fetchers \+ indicators/i)).toBeInTheDocument();
  });

  it("uses meta.universe sizes when present (signals + prices)", () => {
    const signalsMeta = {
      universe: ["AAPL", "MSFT", "GOOG"],
      generatedAt: "2024-01-01T10:00:00Z",
    };
    const pricesMeta = {
      universe: ["AAPL", "MSFT"],
      generatedAt: "2024-01-02T15:30:00Z",
    };

    render(
      <StatSummary
        signalsMeta={signalsMeta}
        signalsData={[
          { ticker: "AAPL", score: 1.2 },
          { ticker: "MSFT", score: 0.8 },
          { ticker: "GOOG", score: 0.5 },
        ]}
        pricesMeta={pricesMeta}
        priceSymbols={["AAPL", "MSFT", "TSLA"]}
      />
    );

    const signalsCard = screen.getByText(/signals universe/i).closest(".stat-card");
    const pricesCard = screen.getByText(/price coverage/i).closest(".stat-card");
    expect(signalsCard).not.toBeNull();
    expect(pricesCard).not.toBeNull();

    expect(within(signalsCard).getByText("3")).toBeInTheDocument();
    expect(within(pricesCard).getByText("2")).toBeInTheDocument();
  });

  it("falls back to signalsData length + priceSymbols length when meta.universe missing", () => {
    render(
      <StatSummary
        signalsMeta={{}}
        signalsData={[
          { ticker: "AAPL", score: 1.2 },
          { ticker: "MSFT", score: 0.8 },
        ]}
        pricesMeta={{}}
        priceSymbols={["AAPL", "MSFT", "TSLA"]}
      />
    );

    const signalsCard = screen.getByText(/signals universe/i).closest(".stat-card");
    const pricesCard = screen.getByText(/price coverage/i).closest(".stat-card");
    expect(signalsCard).not.toBeNull();
    expect(pricesCard).not.toBeNull();

    expect(within(signalsCard).getByText("2")).toBeInTheDocument();
    expect(within(pricesCard).getByText("3")).toBeInTheDocument();
  });

  it("renders last refresh time/date using the latest generatedAt across signals + prices (deterministic)", () => {
    const signalsMeta = { generatedAt: "2024-01-01T07:00:00Z" };
    const pricesMeta = { generatedAt: "2024-01-01T12:00:00Z" }; // later

    render(<StatSummary signalsMeta={signalsMeta} signalsData={[]} pricesMeta={pricesMeta} priceSymbols={[]} />);

    const refreshCard = screen.getByText(/last data refresh/i).closest(".stat-card");
    expect(refreshCard).not.toBeNull();

    // from mocked fmtTimeHHMM / fmtDateShort
    expect(within(refreshCard).getByText("12:00")).toBeInTheDocument();
    expect(within(refreshCard).getByText("1/1/2024")).toBeInTheDocument();
  });
});