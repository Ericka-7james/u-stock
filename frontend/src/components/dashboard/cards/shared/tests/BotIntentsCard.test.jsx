// frontend/src/components/dashboard/cards/shared/tests/BotIntentsCard.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ✅ mock CardShell + PillRow so we don't depend on layout styles
vi.mock("../StatTiles.jsx", () => ({
  CardShell: ({ title, children }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("../OpportunityTable.jsx", () => ({
  PillRow: ({ symbol, sub, onClick }) => (
    <button type="button" onClick={onClick} aria-label={symbol}>
      <div>{symbol}</div>
      <div>{sub}</div>
    </button>
  ),
  default: () => null,
}));

/**
 * IMPORTANT:
 * This test file is in: src/components/dashboard/cards/shared/tests/
 * To reach src/lib/... you must go up 5 levels: ../../../../../
 */
vi.mock("../../../../../lib/format/marketFormat.js", () => ({
  nOrNull: (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  },
  fmtMoney: (n) => `$${Number(n).toFixed(2)}`,
  isAlphaOnlySymbol: (s) => /^[A-Z]+$/.test(String(s || "")),
}));

vi.mock("../../../../../lib/format/safe.js", () => ({
  safeStr: (x, fallback = "") => {
    const s = String(x ?? "").trim();
    return s || fallback;
  },
}));

vi.mock("../../../../../lib/format/datetime.js", () => ({
  fmtEpochSeconds: (ts) => `TS(${ts})`,
}));

// ✅ mock COPY (use the exact resolved path from THIS test file)
vi.mock("../../../../../content/dashboard/cards/tradePerformancePanel.content.ts", () => ({
  TRADE_PERFORMANCE_PANEL_COPY: {
    cards: {
      intents: {
        title: "Bot Intents",
        refresh: "Refresh",
        updatedPrefix: "Updated",
        updatedFallback: "—",
        footnote: "Click an intent to load the symbol in the chart.",
        states: {
          loading: "Loading…",
          emptyNoBot: "Select a bot to view intents.",
          emptyNoIntents: "No intents yet.",
        },
        errors: { prefix: "Error:" },
        headerLines: {
          selectBot: "Select a bot to view intents.",
          unknown: (id) => `Unknown ${id}`,
          offline: (id) => `Offline ${id}`,
          paused: (id) => `Paused ${id}`,
          waiting: (id) => `Waiting ${id}`,
          starting: (id) => `Starting ${id}`,
          disarmed: (id) => `Disarmed ${id}`,
          stopped: (id) => `Stopped ${id}`,
          ok: (id) => `OK ${id}`,
        },
      },
    },
  },
}));

// ✅ mock hook using correct path from THIS test file
const mockUseBotIntents = vi.fn();
vi.mock("../../../../../hooks/bots/useBotIntents.js", () => ({
  default: (...args) => mockUseBotIntents(...args),
}));

async function loadCard() {
  const mod = await import("../BotIntentsCard.jsx");
  return mod.default;
}

function setHookReturn(overrides = {}) {
  mockUseBotIntents.mockReturnValue({
    items: [],
    ts: 0,
    busy: false,
    err: "",
    refresh: vi.fn(),
    ...overrides,
  });
}

describe("BotIntentsCard", () => {
  beforeEach(() => {
    mockUseBotIntents.mockReset();
  });

  it("renders empty state when no bot selected and refresh disabled", async () => {
    setHookReturn();

    const BotIntentsCard = await loadCard();
    render(<BotIntentsCard botUi={null} botId="" />);

    expect(screen.getByText(/Bot Intents/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Select a bot to view intents\./i).length).toBeGreaterThan(0);

    const btn = screen.getByRole("button", { name: /refresh/i });
    expect(btn).toBeDisabled();
  });

  it("shows loading state when busy and no items", async () => {
    setHookReturn({ busy: true, items: [] });

    const BotIntentsCard = await loadCard();
    render(<BotIntentsCard botUi={{ kind: "waiting" }} botId="bot_1" />);

    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });

  it("shows error banner when err is present", async () => {
    setHookReturn({ err: "Boom" });

    const BotIntentsCard = await loadCard();
    render(<BotIntentsCard botUi={{ kind: "waiting" }} botId="bot_1" />);

    // error prefix + message can be separated by nodes, so match flexibly
    expect(screen.getByText((t) => t.includes("Error:") && t.includes("Boom"))).toBeInTheDocument();
  });

  it("wires Refresh button to refresh() and disables it when busy", async () => {
    const refresh = vi.fn();
    setHookReturn({ refresh, busy: false });

    const BotIntentsCard = await loadCard();
    const { rerender } = render(<BotIntentsCard botUi={{ kind: "waiting" }} botId="bot_1" />);

    const btn = screen.getByRole("button", { name: /refresh/i });
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(refresh).toHaveBeenCalledTimes(1);

    setHookReturn({ refresh, busy: true });
    rerender(<BotIntentsCard botUi={{ kind: "waiting" }} botId="bot_1" />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });

  it("renders only alpha symbols, formats row, and clicking calls onPickSymbol(symbol)", async () => {
    const items = [
      { symbol: "AAPL", side: "buy", entry: 10, stop: 9, take_profit: 12, confidence: 0.7 },
      { symbol: "SPY1", side: "sell", entry: 1, stop: 1, take_profit: 1, confidence: 0.2 }, // filtered
    ];
    setHookReturn({ items, ts: 123 });

    const onPickSymbol = vi.fn();
    const BotIntentsCard = await loadCard();
    render(<BotIntentsCard botUi={{ kind: "waiting" }} botId="bot_1" onPickSymbol={onPickSymbol} />);

    expect(screen.getByText(/AAPL · BUY/i)).toBeInTheDocument();
    expect(screen.queryByText(/SPY1/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AAPL · BUY/i }));
    expect(onPickSymbol).toHaveBeenCalledWith("AAPL");
  });

  it("chooses the correct header line based on botUi.kind", async () => {
    setHookReturn({ ts: 999 });

    const BotIntentsCard = await loadCard();
    const { rerender } = render(<BotIntentsCard botUi={{ kind: "offline" }} botId="b1" />);

    expect(screen.getByText(/Offline b1/i)).toBeInTheDocument();

    rerender(<BotIntentsCard botUi={{ kind: "paused" }} botId="b1" />);
    expect(screen.getByText(/Paused b1/i)).toBeInTheDocument();

    rerender(<BotIntentsCard botUi={{ kind: "ok" }} botId="b1" />);
    expect(screen.getByText(/OK b1/i)).toBeInTheDocument();
  });
});