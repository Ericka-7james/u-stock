// src/components/dashboard/tests/DataSnapshotsCard.test.jsx
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import DataSnapshotsCard from "../cards/DataSnapshotsCard.jsx";

describe("DataSnapshotsCard", () => {
  let localeSpy;

  beforeEach(() => {
    // deterministic date formatting across machines/timezones
    localeSpy = vi
      .spyOn(Date.prototype, "toLocaleString")
      .mockImplementation(function () {
        return `LOCAL(${this.toISOString()})`;
      });
  });

  afterEach(() => {
    localeSpy?.mockRestore?.();
  });

  function getUniverseRow() {
    // Find the <strong> label, then go up to the <li>
    const labelEl = screen.getByText(/universe size \(prices\):/i);
    return labelEl.closest("li");
  }

  test("renders header + rows", () => {
    render(<DataSnapshotsCard signalsMeta={{}} pricesMeta={{}} priceSymbols={[]} />);

    expect(
      screen.getByRole("heading", { name: /data snapshots/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/signals:/i)).toBeInTheDocument();
    expect(screen.getByText(/prices:/i)).toBeInTheDocument();
    expect(screen.getByText(/universe size \(prices\):/i)).toBeInTheDocument();
  });

  test("shows em dash when generatedAt is missing", () => {
    render(<DataSnapshotsCard signalsMeta={{}} pricesMeta={{}} priceSymbols={[]} />);

    // There are two rows that show an em dash: Signals & Prices
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  test("formats generatedAt for signals and prices (stable)", () => {
    const signalsGeneratedAt = "2024-01-02T15:30:00.000Z";
    const pricesGeneratedAt = "2024-01-03T10:00:00.000Z";

    render(
      <DataSnapshotsCard
        signalsMeta={{ generatedAt: signalsGeneratedAt }}
        pricesMeta={{ generatedAt: pricesGeneratedAt }}
        priceSymbols={[]}
      />
    );

    expect(screen.getByText(`LOCAL(${signalsGeneratedAt})`)).toBeInTheDocument();
    expect(screen.getByText(`LOCAL(${pricesGeneratedAt})`)).toBeInTheDocument();
  });

  test("computes universe size from pricesMeta.universe when present", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{ universe: ["AAPL", "MSFT", "TSLA"] }}
        priceSymbols={["AAPL", "MSFT", "TSLA", "NVDA"]} // ignored
      />
    );

    const row = getUniverseRow();
    expect(row).toBeTruthy();
    expect(within(row).getByText("3")).toBeInTheDocument();
  });

  test("falls back to priceSymbols length when pricesMeta.universe is missing", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{}}
        priceSymbols={["AAPL", "MSFT", "TSLA", "NVDA"]}
      />
    );

    const row = getUniverseRow();
    expect(row).toBeTruthy();
    expect(within(row).getByText("4")).toBeInTheDocument();
  });

  test("falls back to priceSymbols length when pricesMeta.universe is not an array", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{ universe: null }}
        priceSymbols={["AAPL", "MSFT"]}
      />
    );

    const row = getUniverseRow();
    expect(row).toBeTruthy();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  test("shows '---' when neither universe nor priceSymbols are usable", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{ universe: null }}
        priceSymbols={null}
      />
    );

    const row = getUniverseRow();
    expect(row).toBeTruthy();
    expect(within(row).getByText("---")).toBeInTheDocument();
  });
});
