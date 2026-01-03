import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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
        if (k?.toLowerCase() === "content-type") return headers?.["content-type"] || "application/json";
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
      expect(mockAuth.authFetch).toHaveBeenCalledWith("/integrations", { method: "GET" });
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
});
