// frontend/src/components/bots/tests/BotRunnerCard.test.jsx
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BotRunnerCard from "../BotRunnerCard";

// --- Mocks ---
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// Make HelpTooltip harmless for tests
vi.mock("../../common/HelpTooltip", () => ({
  default: ({ children }) => <div data-testid="help-tooltip">{children}</div>,
}));

// AuthContext mock we can control per-test
let authState = {
  isAuthed: false,
  authFetch: vi.fn(),
};

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

function makeResJson(ok, data, opts = {}) {
  const status = opts.status ?? (ok ? 200 : 500);
  const statusText = opts.statusText ?? (ok ? "OK" : "Error");
  const contentType = opts.contentType ?? "application/json";
  const headers = new Map([["content-type", contentType]]);
  return {
    ok,
    status,
    statusText,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) || null },
    json: vi.fn(async () => data),
    text: vi.fn(async () => JSON.stringify(data ?? {})),
  };
}

async function flush() {
  // flush microtasks
  await act(async () => {});
}

describe("BotRunnerCard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    authState = { isAuthed: false, authFetch: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders sign-in required pill and footer when not authed", async () => {
    render(<BotRunnerCard />);
    await flush();

    expect(screen.getByText("Bot Runner")).toBeInTheDocument();
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(screen.getByText("Sign in to manage bots.")).toBeInTheDocument();

    // Start is disabled (not authed)
    const startBtn = screen.getByRole("button", { name: /start bot/i });
    expect(startBtn).toBeDisabled();
  });

  it("not authed: Start button is disabled (so it cannot navigate)", async () => {
    const user = userEvent.setup();
    render(<BotRunnerCard />);
    await flush();

    const startBtn = screen.getByRole("button", { name: /start bot/i });
    expect(startBtn).toBeDisabled();

    // Clicking a disabled button should do nothing
    await user.click(startBtn);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("authed + alpaca not connected shows warning banner and blocks starting", async () => {
    authState.isAuthed = true;

    authState.authFetch.mockImplementation(async (url) => {
      if (url === "/integrations") {
        return makeResJson(true, { apps: [{ provider: "alpaca", status: "not_connected" }] });
      }
      if (url === "/bots/statuses") {
        return makeResJson(true, { statuses: { ema_trend: { intent: "paused", effective_state: "paused" } } });
      }
      return makeResJson(false, { detail: "unknown route" }, { status: 404, statusText: "Not Found" });
    });

    render(<BotRunnerCard />);
    // Wait for initial async loads to reflect in UI
    expect(await screen.findByText("Alpaca not connected")).toBeInTheDocument();
    expect(screen.getByText(/Alpaca isn’t connected yet/i)).toBeInTheDocument();

    const startBtn = screen.getByRole("button", { name: /start bot/i });
    expect(startBtn).toBeDisabled();
  });

  it("authed + alpaca connected + paused bot enables Start and calls /bots/start", async () => {
    const user = userEvent.setup();
    authState.isAuthed = true;

    authState.authFetch.mockImplementation(async (url, init) => {
      if (url === "/integrations") {
        return makeResJson(true, { apps: [{ provider: "alpaca", status: "connected" }] });
      }
      if (url === "/bots/statuses") {
        return makeResJson(true, {
          statuses: { ema_trend: { intent: "paused", effective_state: "paused" } },
        });
      }
      if (url === "/bots/start") {
        const body = JSON.parse(init?.body || "{}");
        if (body.bot_id !== "ema_trend") {
          return makeResJson(false, { detail: "bad bot_id" }, { status: 400, statusText: "Bad Request" });
        }
        return makeResJson(true, { ok: true });
      }
      return makeResJson(true, { ok: true });
    });

    render(<BotRunnerCard />);

    // Wait for initial state to settle
    expect(await screen.findByText("Alpaca connected")).toBeInTheDocument();

    const startBtn = screen.getByRole("button", { name: /start bot/i });
    expect(startBtn).toBeEnabled();

    await user.click(startBtn);

    // Notice should appear
    expect(await screen.findByText(/Set EMA Trend Bot to RUN/i)).toBeInTheDocument();

    // Ensure /bots/start was called
    const calls = authState.authFetch.mock.calls.map((c) => c[0]);
    expect(calls).toContain("/bots/start");
  });

  it("pause button calls /bots/stop when bot is running/waiting/starting", async () => {
    const user = userEvent.setup();
    authState.isAuthed = true;

    authState.authFetch.mockImplementation(async (url, init) => {
      if (url === "/integrations") {
        return makeResJson(true, { apps: [{ provider: "alpaca", status: "connected" }] });
      }
      if (url === "/bots/statuses") {
        return makeResJson(true, {
          statuses: { ema_trend: { intent: "running", effective_state: "running" } },
        });
      }
      if (url === "/bots/stop") {
        const body = JSON.parse(init?.body || "{}");
        expect(body.bot_id).toBe("ema_trend");
        expect(body.paused_reason).toBe("manual_pause");
        return makeResJson(true, { ok: true });
      }
      return makeResJson(true, { ok: true });
    });

    render(<BotRunnerCard />);
    expect(await screen.findByText("Alpaca connected")).toBeInTheDocument();

    const pauseBtn = screen.getByRole("button", { name: /pause bot/i });
    expect(pauseBtn).toBeEnabled();

    await user.click(pauseBtn);

    expect(await screen.findByText(/Paused EMA Trend Bot/i)).toBeInTheDocument();
    expect(authState.authFetch.mock.calls.map((c) => c[0])).toContain("/bots/stop");
  });

  it("shows active list and opens logs modal when clicking Logs", async () => {
    const user = userEvent.setup();
    authState.isAuthed = true;

    authState.authFetch.mockImplementation(async (url) => {
      if (url === "/integrations") {
        return makeResJson(true, { apps: [{ provider: "alpaca", status: "connected" }] });
      }
      if (url === "/bots/statuses") {
        return makeResJson(true, {
          statuses: {
            ema_trend: {
              intent: "running",
              effective_state: "running",
              message: "hello log line",
              heartbeatAt: 1700000000,
            },
          },
        });
      }
      return makeResJson(false, { detail: "unknown" }, { status: 404 });
    });

    render(<BotRunnerCard />);
    expect(await screen.findByText("Alpaca connected")).toBeInTheDocument();

    // Active list exists
    expect(screen.getByText(/Active \(Run intent\)/i)).toBeInTheDocument();

    // Avoid multiple matches (select option + running list)
    const occurrences = screen.getAllByText("EMA Trend Bot");
    expect(occurrences.length).toBeGreaterThanOrEqual(2);

    // Click Logs button in the active list area
    const logsBtn = screen.getByRole("button", { name: /logs/i });
    await user.click(logsBtn);

    // Modal content (avoid "Logs" text collision with the Logs button)
    const closeX = await screen.findByLabelText("Close logs");
    const modal = closeX.closest(".botrun-modal") || document.body;

    expect(within(modal).getByText(/EMA Trend Bot/i)).toBeInTheDocument();
    expect(within(modal).getByText("hello log line")).toBeInTheDocument();

    // close modal via "Close" button
    await user.click(within(modal).getByRole("button", { name: /^close$/i }));

  });

  it("polls /bots/statuses every 5s when authed", async () => {
    vi.useFakeTimers();

    authState.isAuthed = true;
    authState.authFetch.mockImplementation(async (url) => {
        if (url === "/integrations")
        return makeResJson(true, { apps: [{ provider: "alpaca", status: "connected" }] });
        if (url === "/bots/statuses") return makeResJson(true, { statuses: {} });
        return makeResJson(false, { detail: "unknown" }, { status: 404 });
    });

    render(<BotRunnerCard />);

    // Let initial Promise.all resolve
    await flush();

    // initial /bots/statuses once
    expect(
        authState.authFetch.mock.calls.map((c) => c[0]).filter((u) => u === "/bots/statuses").length
    ).toBe(1);

    // advance 5s -> should call again
    await act(async () => {
        vi.advanceTimersByTime(5000);
    });

    expect(
        authState.authFetch.mock.calls.map((c) => c[0]).filter((u) => u === "/bots/statuses").length
    ).toBe(2);

    vi.useRealTimers();
    });

});
