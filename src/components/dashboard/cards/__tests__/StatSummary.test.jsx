// src/components/dashboard/cards/StatSummary.test.jsx
import { render, screen, within } from "@testing-library/react";
import StatSummary from "../StatSummary.jsx";

describe("StatSummary", () => {
  it("renders fallback values when signals + meta are empty", () => {
    render(
      <StatSummary
        signalsMeta={null}
        signalsData={null}
        pricesMeta={null}
        priceSymbols={[]}
      />
    );

    // Card 1: Signals universe
    const signalsLabel = screen.getByText(/Signals universe/i);
    const signalsCard = signalsLabel.closest(".stat-card");
    expect(signalsCard).not.toBeNull();
    expect(within(signalsCard).getByText("0")).toBeInTheDocument();

    // Card 2: Price coverage
    const pricesLabel = screen.getByText(/Price coverage/i);
    const pricesCard = pricesLabel.closest(".stat-card");
    expect(pricesCard).not.toBeNull();
    expect(within(pricesCard).getByText("0")).toBeInTheDocument();

    // Card 3: Last data refresh
    const refreshLabel = screen.getByText(/Last data refresh/i);
    const refreshCard = refreshLabel.closest(".stat-card");
    expect(refreshCard).not.toBeNull();
    expect(within(refreshCard).getByText("—")).toBeInTheDocument();
    expect(
      within(refreshCard).getByText(/Run fetchers \+ indicators/i)
    ).toBeInTheDocument();
  });

  it("renders non-zero universe sizes when meta.universe is present", () => {
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
        // Longer list, but component should prefer pricesMeta.universe
        priceSymbols={["AAPL", "MSFT", "TSLA"]}
      />
    );

    const signalsCard = screen
      .getByText(/Signals universe/i)
      .closest(".stat-card");
    const pricesCard = screen
      .getByText(/Price coverage/i)
      .closest(".stat-card");

    expect(signalsCard).not.toBeNull();
    expect(pricesCard).not.toBeNull();

    // 3 from signalsMeta.universe
    expect(within(signalsCard).getByText("3")).toBeInTheDocument();
    // 2 from pricesMeta.universe
    expect(within(pricesCard).getByText("2")).toBeInTheDocument();
  });

  it("renders last refresh when meta.generatedAt exists", () => {
    const signalsMeta = { generatedAt: "2024-01-01T07:00:00Z" };
    const pricesMeta = { generatedAt: "2024-01-01T12:00:00Z" }; // later

    const latest = new Date(pricesMeta.generatedAt);
    const expectedTime = latest.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const expectedDate = latest.toLocaleDateString();

    render(
      <StatSummary
        signalsMeta={signalsMeta}
        signalsData={[]}
        pricesMeta={pricesMeta}
        priceSymbols={[]}
      />
    );

    const refreshCard = screen
      .getByText(/Last data refresh/i)
      .closest(".stat-card");

    expect(refreshCard).not.toBeNull();
    expect(within(refreshCard).getByText(expectedTime)).toBeInTheDocument();
    expect(within(refreshCard).getByText(expectedDate)).toBeInTheDocument();
  });
});
