// src/components/dashboard/StatSummary.test.jsx
import { render, screen } from "@testing-library/react";
import StatSummary from "./StatSummary";

// Minimal mock meta for signals
const mockMeta = {
  generatedAt: "2025-11-24T12:00:00Z",
  universe: ["AAPL", "MSFT", "TSLA"],
};

describe("StatSummary", () => {
  it("renders fallback values when signals + meta are empty", () => {
    render(
      <StatSummary
        signalsMeta={null}
        signalsData={[]}
        pricesMeta={null}
      />
    );

    // Universe size should be "0"
    expect(screen.getByText("0")).toBeInTheDocument();

    // Two placeholders: top ticker + last refresh
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders non-zero universe size + top ticker when signals are present", () => {
    const signals = [
      { ticker: "TSLA", score: 5.6, components: {} },
      { ticker: "AAPL", score: 4.1, components: {} },
    ];

    render(
      <StatSummary
        signalsMeta={mockMeta}
        signalsData={signals}
        pricesMeta={null}
      />
    );

    // Find the Universe size card label
    const universeLabel = screen.getByText(/Universe size/i);

    // Grab the closest stat card and its value
    const statCard = universeLabel.closest(".stat-card");
    const valueEl = statCard?.querySelector(".stat-value");

    expect(valueEl).not.toBeNull();
    // When meta/signals are present, this should NOT be "0"
    expect(valueEl.textContent).not.toBe("0");

    // Top in-play ticker should be the first signal by score
    expect(screen.getByText("TSLA")).toBeInTheDocument();
    expect(screen.getByText(/Score:/i)).toBeInTheDocument();
  });

  it("renders last refresh when meta.generatedAt exists", () => {
    render(
      <StatSummary
        signalsMeta={mockMeta}
        signalsData={[]}
        pricesMeta={null}
      />
    );

    const label = screen.getByText("Last data refresh");
    const statCard = label.closest(".stat-card");
    const valueEl = statCard?.querySelector(".stat-value");

    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent).not.toBe("—");
  });
});
