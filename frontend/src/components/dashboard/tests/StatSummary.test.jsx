// src/components/dashboard/tests/StatSummary.test.jsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import StatSummary from "../cards/StatSummary.jsx";

describe("StatSummary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fallback values when signals + meta are empty", () => {
    render(
      <StatSummary
        signalsMeta={null}
        signalsData={null}
        pricesMeta={null}
        priceSymbols={[]}
      />
    );

    const signalsCard = screen
      .getByText(/signals universe/i)
      .closest(".stat-card");
    expect(signalsCard).not.toBeNull();
    expect(within(signalsCard).getByText("0")).toBeInTheDocument();

    const pricesCard = screen
      .getByText(/price coverage/i)
      .closest(".stat-card");
    expect(pricesCard).not.toBeNull();
    expect(within(pricesCard).getByText("0")).toBeInTheDocument();

    const refreshCard = screen
      .getByText(/last data refresh/i)
      .closest(".stat-card");
    expect(refreshCard).not.toBeNull();
    expect(within(refreshCard).getAllByText("—").length).toBeGreaterThan(0);
    expect(
      within(refreshCard).getByText(/run fetchers \+ indicators/i)
    ).toBeInTheDocument();
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

    const signalsCard = screen
      .getByText(/signals universe/i)
      .closest(".stat-card");
    const pricesCard = screen
      .getByText(/price coverage/i)
      .closest(".stat-card");

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

    const signalsCard = screen
      .getByText(/signals universe/i)
      .closest(".stat-card");
    const pricesCard = screen
      .getByText(/price coverage/i)
      .closest(".stat-card");

    expect(signalsCard).not.toBeNull();
    expect(pricesCard).not.toBeNull();

    expect(within(signalsCard).getByText("2")).toBeInTheDocument();
    expect(within(pricesCard).getByText("3")).toBeInTheDocument();
  });

  it("renders last refresh time/date using the latest generatedAt across signals + prices (deterministic)", () => {
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("12:00 PM");
    vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("1/1/2024");

    const signalsMeta = { generatedAt: "2024-01-01T07:00:00Z" };
    const pricesMeta = { generatedAt: "2024-01-01T12:00:00Z" }; // later

    render(
      <StatSummary
        signalsMeta={signalsMeta}
        signalsData={[]}
        pricesMeta={pricesMeta}
        priceSymbols={[]}
      />
    );

    const refreshCard = screen
      .getByText(/last data refresh/i)
      .closest(".stat-card");
    expect(refreshCard).not.toBeNull();

    expect(within(refreshCard).getByText("12:00 PM")).toBeInTheDocument();
    expect(within(refreshCard).getByText("1/1/2024")).toBeInTheDocument();
  });
});
