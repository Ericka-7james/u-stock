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
      <div data-testid="modal">
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
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Default fetch behavior (can be overridden per test)
    global.fetch = vi.fn((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();

      // available bots
      if (method === "GET" && url === "/api/bots/available") {
        return jsonResponse({
          bots: [
            { id: "ema_trend", name: "EMA Trend Bot", description: "Trend follower" },
            { id: "orb", name: "ORB Bot", description: "Opening range breakout" },
          ],
        });
      }

      // market session
      if (method === "GET" && url === "/api/market/us/session") {
        return jsonResponse({ ok: true, is_open: true, next_open: 1730000000 });
      }

      // status (note: BotControlCard uses effective_state now)
      if (method === "GET" && String(url).startsWith("/api/bots/status?bot_id=")) {
        const botId = String(url).split("bot_id=")[1];
        return jsonResponse({
          bot_id: decodeURIComponent(botId),
          effective_state: "stopped",
          mode: "paper",
          lastRun: null,
          lastIntents: 0,
        });
      }

      // config
      if (method === "GET" && String(url).startsWith("/api/bots/config?bot_id=")) {
        return jsonResponse({
          config: { mode: "paper", risk_per_trade: 0.005, max_trades_per_day: 3, min_confidence: 0.62 },
        });
      }

      // start
      if (method === "POST" && url === "/api/bots/start") {
        return jsonResponse({ ok: true });
      }

      // stop (BotControlCard posts JSON to /api/bots/stop)
      if (method === "POST" && url === "/api/bots/stop") {
        return jsonResponse({ ok: true });
      }

      // save config
      if (method === "POST" && url === "/api/bots/config") {
        return jsonResponse({ ok: true });
      }

      // log
      if (method === "GET" && String(url).startsWith("/api/bots/log?bot_id=")) {
        return jsonResponse({
          items: [
            { ts: 1730000100, level: "info", message: "hello", meta: { a: 1 } },
            { ts: 1730000200, level: "warn", message: "world", meta: null },
          ],
        });
      }

      return jsonResponse({ detail: "Unhandled route in test", url }, false, 500);
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

    // default status: stopped -> OFF
    expect(screen.getByText("OFF")).toBeInTheDocument();
  });

  it("changing bot calls onActiveBotChange", async () => {
    const onActiveBotChange = vi.fn();
    render(<BotControlCard activeBotId="ema_trend" onActiveBotChange={onActiveBotChange} />);

    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "orb");

    expect(onActiveBotChange).toHaveBeenCalledWith("orb");
  });

  it("Start requires Arm, then Confirm start, and then refreshes status to LIVE", async () => {
    // status: stopped first, then running after start + refresh
    global.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();

      if (method === "GET" && url === "/api/bots/available") {
        return jsonResponse({ bots: [{ id: "ema_trend", name: "EMA Trend Bot" }] });
      }
      if (method === "GET" && url === "/api/market/us/session") {
        return jsonResponse({ ok: true, is_open: true });
      }
      if (method === "GET" && String(url).startsWith("/api/bots/config?bot_id=")) {
        return jsonResponse({
          config: { mode: "paper", risk_per_trade: 0.005, max_trades_per_day: 3, min_confidence: 0.62 },
        });
      }

      // IMPORTANT: BotControlCard reads `effective_state`
      if (method === "GET" && String(url).startsWith("/api/bots/status?bot_id=")) {
        const statusCalls = global.fetch.mock.calls.filter((c) =>
          String(c[0]).startsWith("/api/bots/status?bot_id=")
        ).length;

        // First status call(s): stopped, after start refresh: running
        return statusCalls <= 1
          ? jsonResponse({ effective_state: "stopped", mode: "paper" })
          : jsonResponse({ effective_state: "running", mode: "paper" });
      }

      if (method === "POST" && url === "/api/bots/start") {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ detail: "Unhandled", url }, false, 500);
    });

    render(<BotControlCard activeBotId="ema_trend" />);

    // Start is disabled until armed
    const startBtn = await screen.findByRole("button", { name: /start/i });
    expect(startBtn).toBeDisabled();

    // Arm first
    const armBtn = await screen.findByRole("button", { name: /^arm$/i });
    await user.click(armBtn);

    // Now start enabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start/i })).not.toBeDisabled();
    });

    // Click Start => opens confirmation modal
    await user.click(screen.getByRole("button", { name: /start/i }));

    const modal = await screen.findByTestId("modal");
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByTestId("modal-title").textContent).toMatch(/start this bot/i);

    // Confirm start
    const confirmBtn = within(modal).getByRole("button", { name: /confirm start/i });
    await user.click(confirmBtn);

    // becomes LIVE after refreshStatus
    await waitFor(() => {
      expect(screen.getByText("LIVE")).toBeInTheDocument();
    });

    // ensure the start endpoint was hit
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/bots/start",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("Stop calls /api/bots/stop and then refreshes status to OFF", async () => {
    // running first so Stop button exists; after stop -> stopped
    global.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method || "GET").toUpperCase();

      if (method === "GET" && url === "/api/bots/available") {
        return jsonResponse({ bots: [{ id: "ema_trend", name: "EMA Trend Bot" }] });
      }
      if (method === "GET" && url === "/api/market/us/session") return jsonResponse({ ok: true, is_open: true });
      if (method === "GET" && String(url).startsWith("/api/bots/config?bot_id=")) return jsonResponse({ config: { mode: "paper" } });

      if (method === "GET" && String(url).startsWith("/api/bots/status?bot_id=")) {
        const stopCalls = global.fetch.mock.calls.filter((c) => String(c[0]) === "/api/bots/stop").length;

        return stopCalls === 0
          ? jsonResponse({ effective_state: "running", mode: "paper" })
          : jsonResponse({ effective_state: "stopped", mode: "paper" });
      }

      // IMPORTANT: BotControlCard posts JSON to /api/bots/stop (not querystring)
      if (method === "POST" && url === "/api/bots/stop") return jsonResponse({ ok: true });

      return jsonResponse({ detail: "Unhandled", url }, false, 500);
    });

    render(<BotControlCard activeBotId="ema_trend" />);

    // should show Stop (because running)
    const stopBtn = await screen.findByRole("button", { name: /stop/i });
    await user.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByText("OFF")).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText(/hello/i)).toBeInTheDocument();
      expect(screen.getByText(/world/i)).toBeInTheDocument();
    });
  });

  it("Risk Controls -> Save posts config and closes modal", async () => {
    render(<BotControlCard activeBotId="ema_trend" />);

    const openBtn = await screen.findByRole("button", { name: /risk controls/i });
    await user.click(openBtn);

    const modal = await screen.findByTestId("modal");
    expect(within(modal).getByTestId("modal-title").textContent).toMatch(/mode \+ risk controls/i);

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
