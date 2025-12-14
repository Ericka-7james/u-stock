import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import DataSnapshotsCard from "../cards/DataSnapshotsCard.jsx";

describe("DataSnapshotsCard", () => {
  let localeSpy;

  beforeEach(() => {
    // Make date formatting deterministic across machines/timezones
    localeSpy = vi
      .spyOn(Date.prototype, "toLocaleString")
      .mockImplementation(function () {
        // `this` is the Date instance
        // show something stable but still tied to input
        return `LOCAL(${this.toISOString()})`;
      });
  });

  afterEach(() => {
    localeSpy?.mockRestore?.();
  });

  test("renders header and labels", () => {
    render(
      <DataSnapshotsCard signalsMeta={{}} pricesMeta={{}} priceSymbols={[]} />
    );

    expect(screen.getByRole("heading", { name: /data snapshots/i })).toBeInTheDocument();
    expect(screen.getByText(/signals:/i)).toBeInTheDocument();
    expect(screen.getByText(/prices:/i)).toBeInTheDocument();
    expect(screen.getByText(/universe size \(prices\):/i)).toBeInTheDocument();
  });

  test("shows em dash when generatedAt is missing", () => {
    render(
      <DataSnapshotsCard signalsMeta={{}} pricesMeta={{}} priceSymbols={[]} />
    );

    // There should be two "—" values: one for Signals and one for Prices
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  test("formats generatedAt times for signals and prices (stable)", () => {
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

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  test("falls back to priceSymbols length when pricesMeta.universe is missing", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{}}
        priceSymbols={["AAPL", "MSFT", "TSLA", "NVDA"]}
      />
    );

    expect(screen.getByText("4")).toBeInTheDocument();
  });

  test("falls back to priceSymbols length when pricesMeta.universe is not an array", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{ universe: null }}
        priceSymbols={["AAPL", "MSFT"]}
      />
    );

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("shows '---' when neither universe nor priceSymbols are usable", () => {
    render(
      <DataSnapshotsCard
        signalsMeta={{}}
        pricesMeta={{ universe: null }}
        priceSymbols={null}
      />
    );

    expect(screen.getByText("---")).toBeInTheDocument();
  });
});
