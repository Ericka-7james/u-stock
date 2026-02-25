import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- mock auth hook ---
const mockAuth = {
  isAuthed: false,
  authFetch: vi.fn(),
};

vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: () => mockAuth,
}));

import ConnectProviderModal from "../ConnectProviderModal";

function makeProvider(key) {
  const base = {
    key,
    name: key === "alpaca" ? "Alpaca" : key === "polygon" ? "Polygon.io" : "X",
    desc: "desc",
    docsUrl: "https://example.com/docs",
  };
  return base;
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

describe("ConnectProviderModal", () => {
  const onClose = vi.fn();
  const onGoSignIn = vi.fn();
  const onConnected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAuthed = false;
    mockAuth.authFetch = vi.fn();
    vi.stubGlobal("open", vi.fn()); // window.open
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders null when closed", () => {
    render(
      <ConnectProviderModal
        open={false}
        provider={makeProvider("alpaca")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders null when provider is missing", () => {
    render(
      <ConnectProviderModal
        open={true}
        provider={null}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows sign-in required when not authed and triggers go sign in", () => {
    mockAuth.isAuthed = false;

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("alpaca")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    expect(screen.getByText(/Sign in required/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Go to Sign In/i }));
    expect(onGoSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Not now/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape key closes modal", () => {
    mockAuth.isAuthed = false;

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("alpaca")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Learn more opens provider docs (when authed)", () => {
    mockAuth.isAuthed = true;

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("alpaca")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Learn more/i }));
    expect(window.open).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noreferrer"
    );
  });

  it("shows validation error if API key missing (polygon)", async () => {
    mockAuth.isAuthed = true;

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("polygon")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Save & Connect/i }));

    expect(await screen.findByText(/API key is required/i)).toBeInTheDocument();
    expect(mockAuth.authFetch).not.toHaveBeenCalled();
  });

  it("shows validation error if API secret missing (alpaca)", async () => {
    mockAuth.isAuthed = true;

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("alpaca")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    // enter API key only
    fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), {
      target: { value: "KEY123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save & Connect/i }));

    expect(
      await screen.findByText(/API secret is required for Alpaca/i)
    ).toBeInTheDocument();
    expect(mockAuth.authFetch).not.toHaveBeenCalled();
  });

  it("submits Alpaca keys successfully and closes", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValueOnce(jsonResponse({ ok: true }, { ok: true }));

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("alpaca")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    // mode default is paper, but we can switch to live for coverage
    fireEvent.change(screen.getByDisplayValue("Paper"), {
      target: { value: "live" },
    });

    fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), {
      target: { value: "AK" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Paste your API secret/i), {
      target: { value: "AS" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save & Connect/i }));

    await waitFor(() => {
      expect(mockAuth.authFetch).toHaveBeenCalledTimes(1);
    });

    const [path, options] = mockAuth.authFetch.mock.calls[0];
    expect(path).toBe("/integrations/alpaca/keys");
    expect(options.method).toBe("POST");

    const parsed = JSON.parse(options.body);
    expect(parsed).toEqual({
      api_key: "AK",
      api_secret: "AS",
      mode: "live",
    });

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("submits Polygon key successfully and closes", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValueOnce(jsonResponse({ ok: true }, { ok: true }));

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("polygon")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), {
      target: { value: "PK" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save & Connect/i }));

    await waitFor(() => {
      expect(mockAuth.authFetch).toHaveBeenCalledTimes(1);
    });

    const [path, options] = mockAuth.authFetch.mock.calls[0];
    expect(path).toBe("/integrations/polygon/keys");

    const parsed = JSON.parse(options.body);
    expect(parsed).toEqual({ api_key: "PK" });

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("shows backend error message when save fails", async () => {
    mockAuth.isAuthed = true;
    mockAuth.authFetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Bad key" }, { ok: false, status: 400 })
    );

    render(
      <ConnectProviderModal
        open={true}
        provider={makeProvider("polygon")}
        onClose={onClose}
        onGoSignIn={onGoSignIn}
        onConnected={onConnected}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), {
      target: { value: "PK" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save & Connect/i }));

    expect(await screen.findByText(/Bad key/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
  });
});
