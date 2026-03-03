// frontend/src/components/pages/tests/BacktestPracticePage.test.jsx
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import BacktestPracticePage from "../BacktestPracticePage.jsx";

vi.mock("../../layout/AppShell", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("../../common/PageHeaderCard", () => ({
  default: ({ title, subtitle, right, children }) => (
    <div data-testid="page-header-card">
      <div data-testid="header-title">{title}</div>
      <div data-testid="header-subtitle">{subtitle}</div>
      <div data-testid="header-right">{right}</div>
      <div data-testid="header-children">{children}</div>
    </div>
  ),
}));

vi.mock("../../../css/pages/BacktestPracticePage.css", () => ({}));

vi.mock("../../../content/pages/backtestPracticePage.content.ts", () => ({
  BACKTEST_PRACTICE_PAGE_COPY: {
    header: { title: "Backtest Practice Lab", tagline: "Sandbox", hint: "Hint text" },
    intro: { primary: "Intro primary", secondary: "Intro secondary" },
    status: { idle: "Idle", queued: "Queued", running: "Running", done: "Done", failed: "Failed" },
    errors: { invalid: { title: "Invalid config", body: "Fix the issues and try again." } },
    sections: {
      config: { title: "Configuration", subtitle: "Set inputs", note: "Guardrails note" },
      preview: { title: "Preview", subtitle: "Preview subtitle" },
      results: { title: "Results", subtitle: "Results subtitle" },
      safety: { title: "Safety", items: ["Item A", "Item B"] },
    },
    fields: {
      symbols: { label: "Symbols", placeholder: "SPY,QQQ", help: "Comma separated" },
      tfEntry: { label: "Entry TF" },
      tfBias: { label: "Bias TF" },
      qty: { label: "Qty" },
      start: { label: "Start" },
      end: { label: "End" },
      warmup: { label: "Warmup" },
      steps: { label: "Steps" },
    },
    kv: { symbols: "Symbols", timeframes: "Timeframes", range: "Range", params: "Params" },
    validation: { title: "Issues", ok: "Looks good" },
    empty: { title: "No run yet", body: "Kick off a run to see results." },
    progress: { title: "Working…", body: "Job id:" },
    metrics: {
      trades: "Trades",
      winRate: "Win rate",
      pnl: "PnL",
      maxDD: "Max DD",
      avgTrade: "Avg trade",
      exposure: "Exposure",
    },
    artifacts: {
      title: "Artifacts",
      report: "Report",
      json: "Run JSON",
      csv: "Trades CSV",
      note: "Coming soon",
    },
    buttons: { run: "Run backtest", running: "Running…", reset: "Reset" },
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BacktestPracticePage />
    </MemoryRouter>
  );
}

describe("BacktestPracticePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders header + initial Idle status pill", () => {
    renderPage();

    expect(screen.getByTestId("header-title").textContent).toBe("Backtest Practice Lab");
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen.getByText("Intro primary")).toBeTruthy();
  });

  it("shows validation issues when symbols are empty", () => {
    renderPage();

    const symbolsInput = screen.getByLabelText("Symbols");
    fireEvent.change(symbolsInput, { target: { value: "" } });

    expect(screen.getByText("Issues")).toBeTruthy();
    expect(screen.getByText("Add at least one symbol.")).toBeTruthy();
  });

  it("clicking Run when invalid shows inline error and does not start running", async () => {
    renderPage();

    const symbolsInput = screen.getByLabelText("Symbols");
    fireEvent.change(symbolsInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Invalid config")).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert).toHaveTextContent("Add at least one symbol.");

    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen.queryByText("Working…")).toBeNull();
  });

  it("valid Run transitions queued -> running -> done and renders results", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

    expect(screen.getByText("Queued")).toBeTruthy();
    expect(screen.getByText("Working…")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(460);
    });
    expect(screen.getByText("Running")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Done")).toBeTruthy();

    expect(screen.getByText("Mock backtest complete (frontend stub)")).toBeTruthy();
    expect(screen.getByText("Trades")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Win rate")).toBeTruthy();
    expect(screen.getByText("57%")).toBeTruthy();
  });

  it("Reset clears job state and returns status to Idle", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText("Done")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen.getByText("No run yet")).toBeTruthy();
    expect(screen.queryByText("Mock backtest complete (frontend stub)")).toBeNull();
  });

  it("cleans up timers on unmount (no setState-on-unmounted warnings)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const calls = errSpy.mock.calls.map((c) => String(c[0] ?? ""));
    const hasUnmountWarning = calls.some((msg) =>
      msg.includes("Can't perform a React state update on an unmounted component")
    );

    expect(hasUnmountWarning).toBe(false);
  });
});