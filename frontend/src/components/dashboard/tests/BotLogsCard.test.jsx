import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import BotLogsCard from "../cards/BotLogsCard.jsx";

const mockApiGetWithRetry = vi.fn();

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

vi.mock("../../common/ErrorBanner.jsx", () => ({
  default: ({ title, body }) => (
    <div data-testid="error-banner">
      <div>{title}</div>
      <div>{body}</div>
    </div>
  ),
}));

vi.mock("../../common/HelpTooltip.jsx", () => ({
  default: ({ children }) => <>{children}</>,
}));

vi.mock("../../../css/dashboard/cards/BotLogsCard.css", () => ({}));

vi.mock("../../../lib/cache/swrCache.js", () => ({
  createSWRCache: (initialData) => ({ data: initialData, ts: 0 }),
  isFresh: () => false,
}));

vi.mock("../../../lib/api/http.js", () => ({
  apiGetWithRetry: (...args) => mockApiGetWithRetry(...args),
}));

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <BotLogsCard {...props} />
    </MemoryRouter>
  );
}

describe("BotLogsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders offline status link, preview items, and issue counts", async () => {
    mockApiGetWithRetry.mockImplementation((url) => {
      if (url.includes("/api/bots/events")) {
        return Promise.resolve({
          items: [
            {
              ts: 1710000000,
              level: "info",
              source: "system",
              action: "request_start",
            },
            {
              ts: 1710000060,
              level: "error",
              source: "runner",
              action: "error",
              user_message: "Broker rejected order",
              technical_message: "Insufficient buying power",
            },
          ],
        });
      }

      if (url.includes("/api/bots/status")) {
        return Promise.resolve({
          effective_state: "offline",
        });
      }

      throw new Error(`unexpected url: ${url}`);
    });

    renderCard();

    expect(await screen.findByText("Start requested")).toBeTruthy();
    expect(screen.getByText("Broker rejected order")).toBeTruthy();

    const offlineLink = screen.getByRole("link", { name: "Runner offline" });
    expect(offlineLink.getAttribute("href")).toBe("/connected-apps");

    expect(screen.getByText("2 events")).toBeTruthy();
    expect(screen.getByText("1 issues")).toBeTruthy();
  });

  it("renders paused-by-condition status and next open messaging", async () => {
    mockApiGetWithRetry.mockImplementation((url) => {
      if (url.includes("/api/bots/events")) {
        return Promise.resolve({ items: [] });
      }

      if (url.includes("/api/bots/status")) {
        return Promise.resolve({
          effective_state: "running",
          paused_reason: "Market closed until next session",
          next_open_epoch: 1710003600,
        });
      }

      throw new Error(`unexpected url: ${url}`);
    });

    renderCard();

    expect(await screen.findByText("Paused by condition")).toBeTruthy();
    expect(screen.getByText("Runner is healthy, but work is paused")).toBeTruthy();
    expect(screen.getAllByText("Market closed until next session").length).toBeGreaterThan(0);
    expect(screen.getByText(/Next open:/)).toBeTruthy();
    expect(screen.getByText("No events match these filters yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View all" })).toBeDisabled();
  });

  it("filters logs by outcome and search, then opens the modal", async () => {
    mockApiGetWithRetry.mockImplementation((url) => {
      if (url.includes("/api/bots/events")) {
        return Promise.resolve({
          items: [
            {
              ts: 1710000000,
              level: "warn",
              source: "risk",
              action: "error",
              user_message: "Risk halted position",
              technical_message: "Kill switch active",
              details: { reason: "kill switch active" },
            },
            {
              ts: 1710000060,
              level: "info",
              source: "runner",
              action: "runtime_running",
              runtime_state: "running",
              details: {},
            },
            {
              ts: 1710000120,
              level: "info",
              source: "strategy",
              action: "log",
              details: { message: "Intent preview sent", count: 2 },
            },
          ],
        });
      }

      if (url.includes("/api/bots/status")) {
        return Promise.resolve({
          effective_state: "running",
        });
      }

      throw new Error(`unexpected url: ${url}`);
    });

    renderCard();

    expect(await screen.findByText("Risk halted position")).toBeTruthy();
    expect(screen.getAllByText("runtime running")).toHaveLength(2);
    expect(screen.getByText("Runner submitted intents")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Outcome"), {
      target: { value: "issues" },
    });

    fireEvent.change(screen.getByPlaceholderText("Search events, actions, runner details…"), {
      target: { value: "risk" },
    });

    await waitFor(() => {
      expect(screen.getByText("Risk halted position")).toBeTruthy();
    });

    expect(screen.queryByText("runtime running")).toBeNull();
    expect(screen.queryByText("Runner submitted intents")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View all" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Bot events · ema_trend/)).toBeTruthy();
    expect(screen.getByText("Raw log")).toBeTruthy();
  });

  it("shows an error banner when events loading fails", async () => {
    mockApiGetWithRetry.mockImplementation((url) => {
      if (url.includes("/api/bots/events")) {
        return Promise.reject(new Error("network exploded"));
      }

      if (url.includes("/api/bots/status")) {
        return Promise.reject(new Error("status down"));
      }

      throw new Error(`unexpected url: ${url}`);
    });

    renderCard();

    expect(await screen.findByText("Couldn’t load logs")).toBeTruthy();
    expect(screen.getByText("network exploded")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getByText("Status unknown")).toBeTruthy();
  });

  it("sends timeframe, mode, and limit params and supports refresh", async () => {
    mockApiGetWithRetry.mockImplementation((url) => {
      if (url.includes("/api/bots/events")) {
        return Promise.resolve({
          items: [
            {
              ts: 1710000000,
              level: "info",
              source: "system",
              action: "request_arm",
            },
          ],
        });
      }

      if (url.includes("/api/bots/status")) {
        return Promise.resolve({
          effective_state: "errored",
        });
      }

      throw new Error(`unexpected url: ${url}`);
    });

    renderCard({
      mode: "live",
      timeframe: { start: "2026-03-01", end: "2026-03-03" },
    });

    expect(await screen.findByText("Bot armed")).toBeTruthy();
    expect(screen.getByText("Error")).toBeTruthy();
    expect(screen.getByText("Error state")).toBeTruthy();

    const eventUrls = mockApiGetWithRetry.mock.calls
      .map(([url]) => url)
      .filter((url) => url.includes("/api/bots/events"));

    expect(eventUrls[0]).toContain("bot_id=ema_trend");
    expect(eventUrls[0]).toContain("mode=live");
    expect(eventUrls[0]).toContain("limit=240");
    expect(eventUrls[0]).toContain("start_ts=");
    expect(eventUrls[0]).toContain("end_ts=");

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "480" },
    });

    await waitFor(() => {
      const urls = mockApiGetWithRetry.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes("/api/bots/events"));
      expect(urls.some((url) => url.includes("limit=480"))).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mockApiGetWithRetry.mock.calls.length).toBeGreaterThan(4);
    });
  });
});