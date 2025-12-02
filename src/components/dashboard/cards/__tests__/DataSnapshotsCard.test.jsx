// src/components/dashboard/cards/__tests__/DataSnapshotsCard.test.jsx
import { render, screen } from "@testing-library/react";
import DataSnapshotsCard from "../DataSnapshotsCard.jsx";

function makeDateString(iso) {
  return new Date(iso).toLocaleString();
}

describe("DataSnapshotsCard", () => {
  test("renders header and basic labels", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{}}
        priceSymbols={[]}
      />
    );

    expect(screen.getByText(/Data snapshots/i)).toBeInTheDocument();
    expect(screen.getByText(/Signals:/i)).toBeInTheDocument();
    expect(screen.getByText(/Prices:/i)).toBeInTheDocument();
    expect(screen.getByText(/Universe size \(prices\):/i)).toBeInTheDocument();
  });

  test("shows formatted generatedAt times for signals and prices", () => {
    const signalsGeneratedAt = "2024-01-02T15:30:00.000Z";
    const pricesGeneratedAt = "2024-01-03T10:00:00.000Z";

    render(
      <DataSnapshotsCard
        signalsMeta={{ generatedAt: signalsGeneratedAt }}
        pricesMeta={{ generatedAt: pricesGeneratedAt }}
        priceSymbols={[]}
      />
    );

    // We don't assert exact string because locale can vary;
    // instead we assert that the localized pieces show up.
    const signalsText = makeDateString(signalsGeneratedAt);
    const pricesText = makeDateString(pricesGeneratedAt);

    expect(screen.getByText(signalsText)).toBeInTheDocument();
    expect(screen.getByText(pricesText)).toBeInTheDocument();
  });

  test("computes universe size from pricesMeta.universe when present", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{ universe: ["AAPL", "MSFT", "TSLA"] }}
        priceSymbols={["AAPL", "MSFT", "TSLA", "NVDA"]} // should be ignored
      />
    );

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  test("falls back to priceSymbols length when universe is not present", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{}}
        priceSymbols={["AAPL", "MSFT", "TSLA", "NVDA"]}
      />
    );

    expect(screen.getByText("4")).toBeInTheDocument();
  });

  test("shows '---' when neither universe nor priceSymbols are usable", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{ universe: null }}
        priceSymbols={null}
      />
    );

    // this is the fallback string from the component
    expect(screen.getByText(/---/)).toBeInTheDocument();
  });
});
