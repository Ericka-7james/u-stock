// frontend/src/components/dashboard/tests/TradePerformancePanel.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

/* -----------------------------------------
   Stable COPY (avoid brittle copy changes)
------------------------------------------ */
vi.mock("../../../content/dashboard/cards/tradePerformancePanel.content.ts", () => {
  const COPY = {
    header: {
      title: "Opportunities",
      subtitles: {
        noBot: "No bot selected.",
        paused: (id) => `Bot ${id} is paused.`,
        running: (id) => `Bot ${id} is running.`,
        waiting: (id) => `Bot ${id} is waiting for market.`,
        starting: (id) => `Bot ${id} is starting.`,
        offline: (id) => `Bot ${id} is offline.`,
        unknown: (id) => `Bot ${id} status unknown.`,
        disarmed: (id) => `Bot ${id} is disarmed.`,
        stopped: (id) => `Bot ${id} is stopped.`,
        fallback: (id) => `Bot ${id} status.`,
      },
      range: {
        aria: "Active range",
        labelPrefix: "Range:",
        fallbackLabel: "—",
      },
    },

    stats: {
      botStatus: {
        label: "Bot Status",
        values: {
          empty: "—",
          offline: "OFFLINE",
          paused: "PAUSED",
          waiting: "WAITING",
          starting: "STARTING",
          running: "RUNNING",
          disarmed: "DISARMED",
          armed: "ARMED",
          stopped: "STOPPED",
          idle: "IDLE",
        },
        subs: {
          noBot: "No bot selected.",
          unknown: "No status yet.",
          offline: "Runner offline.",
          paused: "Bot paused.",
          waiting: "Waiting for market.",
          starting: "Starting up.",
          running: "Trading enabled.",
          disarmed: "Disarmed.",
          armed: "Armed.",
          stopped: "Stopped.",
          idle: "Idle.",
        },
      },
      tradesContext: {
        label: "Trades Context",
        winRatePrefix: "Win rate",
      },
      mini: {
        leaders: "Leaders",
        aligned: "Aligned",
        internal: "Internal",
      },
    },

    cards: {
      intents: {
        title: "Recent Intents",
        headerLines: {
          selectBot: "Select a bot to see intents.",
          unknown: (id) => `Bot ${id} status unknown`,
          offline: (id) => `Bot ${id} offline`,
          paused: (id) => `Bot ${id} paused`,
          waiting: (id) => `Bot ${id} waiting`,
          starting: (id) => `Bot ${id} starting`,
          disarmed: (id) => `Bot ${id} disarmed`,
          stopped: (id) => `Bot ${id} stopped`,
          ok: (id) => `Bot ${id} active`,
        },
        updatedPrefix: "Updated",
        updatedFallback: "—",
        refresh: "Refresh",
        errors: { prefix: "Error:", loadFail: "Failed to load intents." },
        states: { loading: "Loading…", emptyNoBot: "No bot selected.", emptyNoIntents: "No intents yet." },
        footnote: "Intent feed is informational.",
      },

      topDayTrades: {
        title: "Top Day Trades",
        tables: {
          aligned: {
            title: "Bot-aligned (Leaders ∩ Bot)",
            empty: {
              noBot: "Start a bot to generate aligned picks.",
              noOpp: "No bot opportunities yet.",
              offline: "Bot is offline.",
              noOverlap: "No overlap today.",
            },
          },
          leaders: {
            title: "Market Leaders (Today)",
            empty: "No leaders available.",
            sources: {
              plain: "ALPACA",
              computed: "ALPACA+Computed",
            },
          },
          internal: {
            title: "Internal (Bot Picks)",
            empty: "No internal picks.",
          },
        },
        footnote: "Scores are informational.",
      },
    },
  };

  return { TRADE_PERFORMANCE_PANEL_COPY: COPY };
});

/* -----------------------------------------
   ✅ Mock the RIGHT auth hook (component uses authContextBase)
------------------------------------------ */
vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

// (Optional safety if other children use AuthContext)
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

/* -----------------------------------------
   Prevent BotControlCard side-effects
------------------------------------------ */
vi.mock("../cards/BotControlCard.jsx", () => ({
  default: function BotControlCardMock() {
    return <div data-testid="bot-control-card" />;
  },
}));

/* -----------------------------------------
   TimeframeCard mock (deterministic buttons)
------------------------------------------ */
vi.mock("../cards/TimeframeCard.jsx", () => ({
  default: function TimeframeCardMock({ onChange }) {
    return (
      <div data-testid="timeframe-card">
        <button type="button" onClick={() => onChange?.({ preset: "Week" })}>
          Week
        </button>
        <button type="button" onClick={() => onChange?.({ preset: "Month" })}>
          Month
        </button>
        <button type="button" onClick={() => onChange?.({ preset: "Year" })}>
          Year
        </button>
      </div>
    );
  },
}));

/* -----------------------------------------
   Connected brokers mini card mock
------------------------------------------ */
vi.mock("../cards/shared/ConnectedBrokersMiniCard.jsx", () => ({
  default: function ConnectedBrokersMiniCardMock() {
    return <div data-testid="connected-brokers" />;
  },
}));

/* -----------------------------------------
   StatTiles mock (predictable DOM)
------------------------------------------ */
vi.mock("../cards/shared/StatTiles.jsx", () => ({
  CardShell: function CardShell({ title, className, children }) {
    return (
      <section className={`tpCard ${className || ""}`.trim()}>
        <h3>{title}</h3>
        <div>{children}</div>
      </section>
    );
  },

  BigStat: function BigStat({ label, value, sub }) {
    return (
      <div className="tpCard" data-testid={`bigstat:${label}`}>
        <div>{label}</div>
        <div>{String(value)}</div>
        {sub ? <div>{sub}</div> : null}
      </div>
    );
  },

  MiniStat: function MiniStat({ label, value }) {
    return (
      <div data-testid={`ministat:${label}`}>
        <span>{label}</span>
        <span>{String(value)}</span>
      </div>
    );
  },
}));

/* -----------------------------------------
   OpportunityTable mock
------------------------------------------ */
vi.mock("../cards/shared/OpportunityTable.jsx", () => ({
  default: function OpportunityTableMock({ title, rows = [], emptyMessage = "", sourceLabel }) {
    return (
      <div className="tpOppMiniTable">
        <h4>{title}</h4>
        <div className="tpOppHead">
          <span>Symbol</span>
          <span>Score</span>
        </div>

        {sourceLabel ? <div>{`Source: ${sourceLabel}`}</div> : null}

        {rows?.length ? (
          <ul>
            {rows.map((r) => (
              <li key={r.symbol}>
                <span>{r.symbol}</span>
                <span>{String(r.score)}</span>
                {r.sub ? <span>{r.sub}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="tpEmpty">{emptyMessage}</div>
        )}
      </div>
    );
  },

  PillRow: function PillRowMock() {
    return <div data-testid="pill-row" />;
  },
}));

/* -----------------------------------------
   Import component after mocks
------------------------------------------ */
import TradePerformancePanel from "../cards/TradePerformancePanel.jsx";

describe("TradePerformancePanel", () => {
  let originalConsoleError;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = (...args) => {
      const msg = String(args?.[0] ?? "");
      if (msg.includes("not wrapped in act")) return;
      originalConsoleError(...args);
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [], ts: 0 }),
      }))
    );
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.unstubAllGlobals();
    cleanup();
  });

  function baseProps(overrides = {}) {
    return {
      data: { start: "2026-01-01", end: "2026-01-07", trades: [] },

      opportunities: { stocks: [] },
      leaders: [],
      onPickSymbol: vi.fn(),

      timeframe: null,
      onTimeframeChange: vi.fn(),

      activeBot: null,
      botStatuses: null,
      onStartBot: vi.fn(),
      onStopBot: vi.fn(),

      ...overrides,
    };
  }

  function renderWithRouter(props) {
    return render(
      <MemoryRouter>
        <TradePerformancePanel {...props} />
      </MemoryRouter>
    );
  }

  const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();

  const getOppTableByTitle = (titleTextOrRegex) => {
    const titleEl =
      titleTextOrRegex instanceof RegExp
        ? screen.getByRole("heading", { level: 4, name: titleTextOrRegex })
        : screen.getByRole("heading", { level: 4, name: String(titleTextOrRegex) });

    return titleEl.closest(".tpOppMiniTable");
  };

  const getCardByTitle = (titleRegexOrText) => {
    const titleEl =
      titleRegexOrText instanceof RegExp ? screen.getByText(titleRegexOrText) : screen.getByText(String(titleRegexOrText));
    return titleEl.closest(".tpCard");
  };

  it("sanity: component import resolves", () => {
    expect(TradePerformancePanel).toBeTypeOf("function");
  });

  it("renders header + timeframe control and calls onTimeframeChange from TimeframeCard", async () => {
    const user = userEvent.setup();
    const onTimeframeChange = vi.fn();

    renderWithRouter(baseProps({ onTimeframeChange }));

    expect(screen.getByRole("heading", { name: /opportunities/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /week/i }));
    await user.click(screen.getByRole("button", { name: /month/i }));
    await user.click(screen.getByRole("button", { name: /year/i }));

    expect(onTimeframeChange).toHaveBeenCalledTimes(3);
    const payloads = onTimeframeChange.mock.calls.map((c) => c[0]?.preset);
    expect(payloads).toEqual(["Week", "Month", "Year"]);
  });

  it("shows aligned locked message when no bot is selected", () => {
    renderWithRouter(baseProps({ activeBot: null, botStatuses: null }));

    const alignedTable = getOppTableByTitle(/bot-aligned/i);
    expect(alignedTable).not.toBeNull();

    const text = normalize(alignedTable.textContent).toLowerCase();
    expect(text).toContain("start a bot to generate aligned picks");
  });

  it("renders Trades Context count and computes win rate percent", () => {
    renderWithRouter(
      baseProps({
        data: {
          start: "2026-01-01",
          end: "2026-01-07",
          trades: [{ pnl: 10 }, { pnl: -5 }, { pnl: 2 }],
        },
      })
    );

    const tradesCard = getCardByTitle(/trades context/i);
    expect(tradesCard).not.toBeNull();

    expect(within(tradesCard).getByText("Trades Context")).toBeInTheDocument();
    expect(within(tradesCard).getByText("3")).toBeInTheDocument();
    expect(within(tradesCard).getByText(/win rate 67%/i)).toBeInTheDocument();
  });

  it("renders Market Leaders section and shows Source: ALPACA by default", () => {
    renderWithRouter(
      baseProps({
        leaders: [{ symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: false }],
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const text = normalize(leadersTable.textContent);
    expect(text).toMatch(/Source:\s*ALPACA/i);
  });

  it("uses ALPACA+Computed source label when prevCloseComputed=true", () => {
    renderWithRouter(
      baseProps({
        leaders: [{ symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: true }],
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const text = normalize(leadersTable.textContent);
    expect(text).toMatch(/Source:\s*ALPACA\+Computed/i);
  });

  it("renders leaders rows when leaders are provided", () => {
    renderWithRouter(
      baseProps({
        leaders: [
          { symbol: "AAPL", changePct: 2.5, last: 100, prevClose: 98 },
          { symbol: "MSFT", changePct: 1.0, last: 50, prevClose: 49 },
        ],
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const text = normalize(leadersTable.textContent);
    expect(text).toMatch(/AAPL/i);
    expect(text).toMatch(/MSFT/i);
  });

  it("internal shows picks when opportunities provided; aligned still locked with no bot", () => {
    renderWithRouter(
      baseProps({
        opportunities: {
          stocks: [
            { symbol: "AAPL", score: 3.25, reason: "bot likes it" },
            { symbol: "TSLA", score: 2.0, reason: "bot likes it" },
          ],
        },
      })
    );

    const alignedTable = getOppTableByTitle(/bot-aligned/i);
    expect(alignedTable).not.toBeNull();
    expect(normalize(alignedTable.textContent).toLowerCase()).toContain("start a bot to generate aligned picks");

    const internalTable = getOppTableByTitle(/internal \(bot picks\)/i);
    expect(internalTable).not.toBeNull();

    const internalText = normalize(internalTable.textContent);
    expect(internalText).toMatch(/AAPL/i);
    expect(internalText).toMatch(/TSLA/i);
  });

  it("leaders table contains Symbol/Score headings (structure)", () => {
    const oppStocks = ["AAPL", "MSFT", "GOOG", "TSLA"].map((s, i) => ({
      symbol: s,
      score: i + 1,
      reason: `r${i}`,
    }));

    renderWithRouter(
      baseProps({
        opportunities: { stocks: oppStocks },
        leaders: oppStocks.map((o, i) => ({
          symbol: o.symbol,
          changePct: i + 1,
          last: 100 + i,
          prevClose: 99 + i,
        })),
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const leadersText = normalize(leadersTable.textContent);
    expect(leadersText).toMatch(/Symbol/i);
    expect(leadersText).toMatch(/Score/i);
  });
});