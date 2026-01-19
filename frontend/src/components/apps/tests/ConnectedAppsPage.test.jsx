import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

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
      <div data-testid="connect-modal">
        Modal Open: {provider?.key || "none"}
      </div>
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

    await waitFor(() => {
      expect(mockAuth.authFetch).toHaveBeenCalledWith("/integrations", {
        method: "GET",
      });
    });

    // Should reflect status mapping
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
    expect(screen.getByText("Connected")).toBeInTheDocument();
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

    // wait for initial fetch
    await waitFor(() => expect(mockAuth.authFetch).toHaveBeenCalled());

    // Click "Learn more" for Alpaca (first card)
    const learnMoreButtons = screen.getAllByRole("button", { name: /Learn more/i });
    fireEvent.click(learnMoreButtons[0]);

    expect(window.open).toHaveBeenCalled();
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

    await waitFor(() => {
      expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
    });
  });

  it("refresh button triggers another /integrations call when connected", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValueOnce(
      jsonResponse({
        apps: [
          { provider: "alpaca", status: "connected" },
          { provider: "polygon", status: "not_connected" },
          { provider: "tradingview", status: "not_connected" },
        ],
      })
    );
    mockAuth.authFetch.mockResolvedValueOnce(
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

    // Refresh button only appears on connected cards
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

    // Connected provider card -> Disconnect + Refresh, no Connect/Learn more
    const alpaca = within(alpacaCard);
    expect(alpaca.getByText("Connected")).toBeInTheDocument();
    expect(alpaca.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(alpaca.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    expect(alpaca.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(alpaca.queryByRole("button", { name: /Learn more/i })).toBeNull();

    // Unconnected provider card -> Connect + Learn more, no Disconnect/Refresh
    const polygon = within(polygonCard);
    expect(polygon.getByText("Not connected")).toBeInTheDocument();
    expect(polygon.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(polygon.getByRole("button", { name: /Learn more/i })).toBeInTheDocument();
    expect(polygon.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(polygon.queryByRole("button", { name: /Refresh/i })).toBeNull();
  });
});
