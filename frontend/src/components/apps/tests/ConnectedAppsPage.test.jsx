import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within, cleanup } from "@testing-library/react";

// ✅ mock router navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ✅ mock AppShell to avoid layout complexity
vi.mock("../../layout/AppShell", () => ({
  default: ({ title, children }) => (
    <div>
      <div data-testid="app-shell-title">{title}</div>
      {children}
    </div>
  ),
}));

// ✅ mock ConnectProviderModal: just show something when open
vi.mock("../ConnectProviderModal", () => ({
  default: ({ open, provider }) =>
    open ? (
      <div data-testid="connect-modal">Modal Open: {provider?.key || "none"}</div>
    ) : null,
}));

// ✅ mock auth hook
const mockAuth = {
  isAuthed: false,
  authFetch: vi.fn(),
  logout: vi.fn(),
};

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

import ConnectedAppsPage from "../ConnectedAppsPage";

function jsonResponse(data, { ok = true, status = 200, headers } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (k) => {
        if (k?.toLowerCase() === "content-type")
          return headers?.["content-type"] || "application/json";
        return null;
      },
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe("ConnectedAppsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAuthed = false;
    mockAuth.authFetch = vi.fn();
    mockAuth.logout = vi.fn();
    mockNavigate.mockReset();
    vi.stubGlobal("open", vi.fn()); // window.open
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows not signed-in banner when logged out", () => {
    render(<ConnectedAppsPage />);
    expect(screen.getByText(/You’re not signed in/i)).toBeInTheDocument();
  });

  it("calls /integrations on mount when authed", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValue(
      jsonResponse({
        apps: [
          { provider: "alpaca", status: "not_connected" },
          { provider: "polygon", status: "connected" },
          { provider: "tradingview", status: "not_connected" },
        ],
      })
    );

    render(<ConnectedAppsPage />);

    // ✅ don't be overly strict about exact options object (component may add headers/signal/etc.)
    await waitFor(() => {
      expect(mockAuth.authFetch).toHaveBeenCalled();
    });

    const [url, opts] = mockAuth.authFetch.mock.calls[0] || [];
    expect(String(url)).toMatch(/\/integrations/);
    if (opts) {
      expect(opts).toEqual(expect.objectContaining({ method: "GET" }));
    }

    // ✅ Wait for UI to reflect fetch results
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
  });

  it("opens docs when clicking Learn more on an unconnected provider", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValue(
      jsonResponse({
        apps: [
          { provider: "alpaca", status: "not_connected" },
          { provider: "polygon", status: "not_connected" },
          { provider: "tradingview", status: "not_connected" },
        ],
      })
    );

    render(<ConnectedAppsPage />);

    await waitFor(() => expect(mockAuth.authFetch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /alpaca docs/i }));
    expect(window.open).toHaveBeenCalledWith(
      "https://docs.alpaca.markets/",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("opens connect modal when clicking Connect", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValue(
      jsonResponse({
        apps: [
          { provider: "alpaca", status: "not_connected" },
          { provider: "polygon", status: "not_connected" },
          { provider: "tradingview", status: "not_connected" },
        ],
      })
    );

    render(<ConnectedAppsPage />);
    await waitFor(() => expect(mockAuth.authFetch).toHaveBeenCalled());

    const connectButtons = screen.getAllByRole("button", { name: "Connect" });
    fireEvent.click(connectButtons[0]);

    const modal = screen.getByTestId("connect-modal");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveTextContent(/alpaca/i);
  });

  it("shows an error banner if /integrations returns 401", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValue(
      jsonResponse({ detail: "Not authenticated" }, { ok: false, status: 401 })
    );

    render(<ConnectedAppsPage />);

    expect(await screen.findByText(/Session expired/i)).toBeInTheDocument();
  });

  it("refresh button triggers another /integrations call when connected", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch
      .mockResolvedValueOnce(
        jsonResponse({
          apps: [
            { provider: "alpaca", status: "connected" },
            { provider: "polygon", status: "not_connected" },
            { provider: "tradingview", status: "not_connected" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          apps: [
            { provider: "alpaca", status: "connected" },
            { provider: "polygon", status: "connected" },
            { provider: "tradingview", status: "not_connected" },
          ],
        })
      );

    render(<ConnectedAppsPage />);

    await waitFor(() => expect(mockAuth.authFetch).toHaveBeenCalledTimes(1));

    const refreshButtons = await screen.findAllByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshButtons[0]);

    await waitFor(() => expect(mockAuth.authFetch).toHaveBeenCalledTimes(2));
  });

  it("shows Disconnect/Refresh only for connected providers (and Connect/Learn more only for unconnected)", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValue(
      jsonResponse({
        apps: [
          { provider: "alpaca", status: "connected" },
          { provider: "polygon", status: "not_connected" },
          { provider: "tradingview", status: "not_connected" },
        ],
      })
    );

    render(<ConnectedAppsPage />);
    await waitFor(() => expect(mockAuth.authFetch).toHaveBeenCalled());

    // Grab provider cards in render order (matches PROVIDERS order in component)
    const cards = document.querySelectorAll(".connected-card");
    expect(cards.length).toBeGreaterThanOrEqual(3);

    const alpacaCard = cards[0];
    const polygonCard = cards[1];

    const alpaca = within(alpacaCard);
    expect(await alpaca.findByText("Connected")).toBeInTheDocument();
    expect(alpaca.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(alpaca.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    expect(alpaca.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(alpaca.queryByRole("button", { name: /alpaca docs/i })).toBeNull();

    const polygon = within(polygonCard);
    expect(polygon.getByText("Not connected")).toBeInTheDocument();
    expect(polygon.getByRole("button", { name: /polygon docs/i })).toBeInTheDocument();
    expect(polygon.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(polygon.queryByRole("button", { name: /Refresh/i })).toBeNull();
  });
});
