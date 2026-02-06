// frontend/src/components/dashboard/tests/BotControlCard.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BotControlCard from "../cards/BotControlCard.jsx";

/* -------------------------
   UI stubs
-------------------------- */
vi.mock("../../common/HelpTooltip.jsx", () => ({
  default: ({ text }) => <span data-testid="help-tooltip">{text}</span>,
}));

vi.mock("../../common/Modal.jsx", () => ({
  default: ({ open, title, children, footer, onClose }) =>
    open ? (
      <div data-testid="modal" role="dialog" aria-label="modal">
        <div data-testid="modal-title">{title}</div>
        <button data-testid="modal-close" onClick={onClose}>
          close
        </button>
        <div data-testid="modal-body">{children}</div>
        <div data-testid="modal-footer">{footer}</div>
      </div>
    ) : null,
}));

/* -------------------------
   Fetch mock helper
-------------------------- */
function jsonResponse(obj, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(obj),
    text: () => Promise.resolve(JSON.stringify(obj)),
  });
}

describe("BotControlCard", () => {
  /** @type {ReturnType<typeof userEvent.setup>} */
  let user;

  beforeEach(() => {
    user = userEvent.setup();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Default fetch behavior (override per-test as needed).
    global.fetch = vi.fn((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();
      const u = String(url);

      // available bots
      if (method === "GET" && u === "/api/bots/available") {
        return jsonResponse({
          bots: [
            { id: "ema_trend", name: "EMA Trend Bot", description: "Trend follower" },
            { id: "orb", name: "ORB Bot", description: "Opening range breakout" },
          ],
        });
      }

      // market session
      if (method === "GET" && u === "/api/market/us/session") {
        return jsonResponse({ ok: true, is_open: true, next_open: 1730000000 });
      }

      // status
      if (method === "GET" && u.startsWith("/api/bots/status?bot_id=")) {
        const botId = u.split("bot_id=")[1];
        return jsonResponse({
          bot_id: decodeURIComponent(botId),
          effective_state: "stopped",
          mode: "paper",
          lastRun: null,
          lastIntents: 0,
        });
      }

      // config
      if (method === "GET" && u.startsWith("/api/bots/config?bot_id=")) {
        return jsonResponse({
          config: {
            mode: "paper",
            risk_per_trade: 0.005,
            max_trades_per_day: 3,
            min_confidence: 0.62,
          },
        });
      }

      // start
      if (method === "POST" && u === "/api/bots/start") {
        return jsonResponse({ ok: true });
      }

      // pause/stop
      if (method === "POST" && u === "/api/bots/stop") {
        return jsonResponse({ ok: true });
      }

      // save config
      if (method === "POST" && u === "/api/bots/config") {
        return jsonResponse({ ok: true });
      }

      // logs (tolerant to /log vs /logs + extra query params)
      if (method === "GET" && u.includes("/api/bots/log")) {
        return jsonResponse({
          items: [
            { ts: 1730000100, level: "info", message: "hello", meta: { a: 1 } },
            { ts: 1730000200, level: "warn", message: "world", meta: null },
          ],
        });
      }

      // ✅ fail fast instead of hanging
      throw new Error(`Unhandled fetch in test: ${method} ${u}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders and loads available bots into the select", async () => {
    render(<BotControlCard activeBotId="ema_trend" />);

    const select = await screen.findByRole("combobox");
    expect(select).toBeInTheDocument();

    expect(within(select).getByRole("option", { name: /ema trend bot/i })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: /orb bot/i })).toBeInTheDocument();

    // status pill should show IDLE by default (effective_state: stopped)
    expect(screen.getAllByText(/^IDLE$/i).length).toBeGreaterThan(0);

    // armed pill should show DISARMED by default
    expect(screen.getByText(/disarmed/i)).toBeInTheDocument();

    // Arm button should be present when not LIVE
    expect(screen.getByRole("button", { name: /^arm$/i })).toBeInTheDocument();

    // Start exists but disabled until armed
    const startBtn = screen.getByRole("button", { name: /^start$/i });
    expect(startBtn).toBeDisabled();
  });

  it("changing bot calls onActiveBotChange", async () => {
    const onActiveBotChange = vi.fn();
    render(<BotControlCard activeBotId="ema_trend" onActiveBotChange={onActiveBotChange} />);

    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "orb");

    expect(onActiveBotChange).toHaveBeenCalledWith("orb");
  });

  it("Start requires Arm, then Confirm start, and then refreshes status to LIVE", async () => {
    let started = false;

    global.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();
      const u = String(url);

      if (method === "GET" && u === "/api/bots/available") {
        return jsonResponse({ bots: [{ id: "ema_trend", name: "EMA Trend Bot" }] });
      }

      if (method === "GET" && u === "/api/market/us/session") {
        return jsonResponse({ ok: true, is_open: true });
      }

      if (method === "GET" && u.startsWith("/api/bots/config?bot_id=")) {
        return jsonResponse({ config: { mode: "paper" } });
      }

      // ✅ Stay stopped until we actually POST /api/bots/start
      if (method === "GET" && u.startsWith("/api/bots/status?bot_id=")) {
        return jsonResponse({
          effective_state: started ? "running" : "stopped",
          mode: "paper",
        });
      }

      if (method === "POST" && u === "/api/bots/start") {
        started = true;
        return jsonResponse({ ok: true });
      }

      throw new Error(`Unhandled fetch in test: ${method} ${u}`);
    });

    render(<BotControlCard activeBotId="ema_trend" />);

    // wait for initial render
    const startBtn = await screen.findByRole("button", { name: /^start$/i });
    expect(startBtn).toBeDisabled();

    const armBtn = await screen.findByRole("button", { name: /^arm$/i });
    await user.click(armBtn);

    // ✅ Start should become enabled (still stopped, so Start exists)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^start$/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: /^start$/i }));

    const modal = await screen.findByTestId("modal");
    expect(within(modal).getByTestId("modal-title").textContent).toMatch(/start this bot/i);

    await user.click(within(modal).getByRole("button", { name: /confirm start/i }));

    // ✅ After POST start, our mock flips status to running -> UI shows LIVE + Pause
    await waitFor(() => {
      expect(screen.getByText(/live/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /^pause$/i })).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/bots/start",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("Pause calls /api/bots/stop and then shows PAUSED", async () => {
    global.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();
      const u = String(url);

      if (method === "GET" && u === "/api/bots/available") {
        return jsonResponse({ bots: [{ id: "ema_trend", name: "EMA Trend Bot" }] });
      }
      if (method === "GET" && u === "/api/market/us/session") {
        return jsonResponse({ ok: true, is_open: true });
      }
      if (method === "GET" && u.startsWith("/api/bots/config?bot_id=")) {
        return jsonResponse({ config: { mode: "paper" } });
      }

      if (method === "GET" && u.startsWith("/api/bots/status?bot_id=")) {
        const stopCalls = global.fetch.mock.calls.filter(
          (c) => String(c[0]) === "/api/bots/stop" && (c[1]?.method || "GET").toUpperCase() === "POST"
        ).length;

        return stopCalls === 0
          ? jsonResponse({ effective_state: "running", mode: "paper" })
          : jsonResponse({ effective_state: "paused", mode: "paper" });
      }

      if (method === "POST" && u === "/api/bots/stop") {
        return jsonResponse({ ok: true });
      }

      throw new Error(`Unhandled fetch in test: ${method} ${u}`);
    });

    render(<BotControlCard activeBotId="ema_trend" />);

    const pauseBtn = await screen.findByRole("button", { name: /pause/i });
    await user.click(pauseBtn);

    await waitFor(() => {
      expect(screen.getByText("PAUSED")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/bots/stop",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("View log opens modal and renders log entries", async () => {
    render(<BotControlCard activeBotId="ema_trend" />);

    const btn = await screen.findByRole("button", { name: /view log/i });
    await user.click(btn);

    const modal = await screen.findByTestId("modal");
    expect(modal).toBeInTheDocument();

    expect(await screen.findByText(/hello/i)).toBeInTheDocument();
    expect(await screen.findByText(/world/i)).toBeInTheDocument();
  });

  it("Risk Controls -> Save posts config and closes modal", async () => {
    render(<BotControlCard activeBotId="ema_trend" />);

    const openBtn = await screen.findByRole("button", { name: /risk controls/i });
    await user.click(openBtn);

    const modal = await screen.findByTestId("modal");

    // ✅ Updated expectation to match current UI
    expect(within(modal).getByTestId("modal-title").textContent).toMatch(/^risk controls$/i);

    const saveBtn = within(modal).getByRole("button", { name: /save/i });
    await user.click(saveBtn);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/bots/config",
      expect.objectContaining({ method: "POST" })
    );

    await waitFor(() => {
      expect(screen.queryByTestId("modal")).toBeNull();
    });
  });
});
