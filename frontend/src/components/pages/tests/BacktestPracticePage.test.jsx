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

vi.mock("../../common/Modal.jsx", () => ({
  default: ({ open, title, children, footer, onClose }) =>
    open ? (
      <div role="dialog" aria-modal="true">
        <div>{title}</div>
        <button type="button" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
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

function jsonResponse(data, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  });
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("BacktestPracticePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
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
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one symbol.");
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen.queryByText("Working…")).toBeNull();
  });

  it("valid Run transitions queued -> running -> done and renders results", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        jsonResponse({
          job_id: "job_123",
        })
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          id: "job_123",
          status: "queued",
        })
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          id: "job_123",
          status: "running",
        })
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          id: "job_123",
          status: "done",
          result: {
            headline: "Mock backtest complete (frontend stub)",
            summary: {
              trades: 42,
              win_rate: 0.57,
              pnl: 1234,
              max_drawdown: 0.12,
              avg_trade: 29.4,
              exposure: 0.31,
            },
            artifacts: {
              report_txt: "/fake/report.txt",
              run_json_gz: "/fake/run.json.gz",
            },
            overview: {
              universe: ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"],
              config_line: {
                tf_bias: "15Min",
                tf_entry: "5Min",
                start: "2025-09-04",
                end: "2026-03-03",
                feed: "sip",
              },
              errors: 0,
            },
          },
        })
      );

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

    await flushAsync();

    expect(screen.getByText("Queued")).toBeTruthy();
    expect(screen.getByText("Working…")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await flushAsync();

    expect(screen.getByText("Running")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await flushAsync();

    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Mock backtest complete (frontend stub)")).toBeTruthy();
    expect(screen.getByText("Trades")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Win rate")).toBeTruthy();
    expect(screen.getByText("57%")).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

it("Reset clears active job/form state while preserving latest completed result status", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockImplementationOnce(() =>
      jsonResponse({
        job_id: "job_123",
      })
    )
    .mockImplementationOnce(() =>
      jsonResponse({
        id: "job_123",
        status: "queued",
      })
    )
    .mockImplementationOnce(() =>
      jsonResponse({
        id: "job_123",
        status: "running",
      })
    )
    .mockImplementationOnce(() =>
      jsonResponse({
        id: "job_123",
        status: "done",
        result: {
          headline: "Mock backtest complete (frontend stub)",
          summary: {
            trades: 42,
            win_rate: 0.57,
            pnl: 1234,
            max_drawdown: 0.12,
            avg_trade: 29.4,
            exposure: 0.31,
          },
          artifacts: {
            report_txt: "/fake/report.txt",
            run_json_gz: "/fake/run.json.gz",
          },
          overview: {
            universe: ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"],
            config_line: {
              tf_bias: "15Min",
              tf_entry: "5Min",
              start: "2025-09-04",
              end: "2026-03-03",
              feed: "sip",
            },
            errors: 0,
          },
        },
      })
    );

  renderPage();

  fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

  await flushAsync();
  expect(screen.getByText("Queued")).toBeTruthy();

  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  await flushAsync();
  expect(screen.getByText("Running")).toBeTruthy();

  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  await flushAsync();
  expect(screen.getByText("Done")).toBeTruthy();
  expect(screen.getByText("Mock backtest complete (frontend stub)")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Reset" }));

  expect(screen.getByText("Done")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Mock backtest complete (frontend stub)")).toBeNull();
  expect(screen.getByRole("button", { name: "Reopen latest results" })).toBeTruthy();
  expect(screen.getByLabelText("Symbols")).toHaveValue("SPY,QQQ,AAPL,MSFT,NVDA");
});

  it("cleans up timers on unmount (no setState-on-unmounted warnings)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        jsonResponse({
          job_id: "job_123",
        })
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          id: "job_123",
          status: "queued",
        })
      );

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

    await flushAsync();
    expect(screen.getByText("Queued")).toBeTruthy();

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await flushAsync();

    const calls = errSpy.mock.calls.map((c) => String(c[0] ?? ""));
    const hasUnmountWarning = calls.some((msg) =>
      msg.includes("Can't perform a React state update on an unmounted component")
    );

    expect(hasUnmountWarning).toBe(false);
  });
});