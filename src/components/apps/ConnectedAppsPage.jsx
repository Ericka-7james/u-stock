import { useEffect, useMemo, useState } from "react";
import AppShell from "../layout/AppShell";
import "../../css/apps/ConnectedAppsPage.css";
import { useAuth } from "../../context/AuthContext";

const PROVIDERS = [
  {
    key: "alpaca",
    name: "Alpaca",
    desc: "Paper trading + live market data (great for prototyping).",
    tags: ["Paper trading", "Market data"],
  },
  {
    key: "polygon",
    name: "Polygon.io",
    desc: "Professional-grade market data + aggregates.",
    tags: ["Intraday candles", "Real-time"],
  },
  {
    key: "tradingview",
    name: "TradingView",
    desc: "Charts + alerts (usually via webhooks).",
    tags: ["Alerts", "Webhooks"],
  },
];

export default function ConnectedAppsPage() {
  const { token } = useAuth(); // assuming you store access_token in auth context
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [error, setError] = useState("");

  const apiBase = import.meta.env.VITE_API_BASE_URL;

  console.log("API BASE:", apiBase);

  const headers = useMemo(() => {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  async function loadConnections() {
    setError("");
    setLoading(true);
    try {
      // Backend endpoint you’ll add soon:
      // GET /integrations
      const res = await fetch(`${apiBase}/integrations`, { headers });
      if (!res.ok) {
        const msg = await safeErrorMessage(res);
        throw new Error(msg);
      }
      const data = await res.json();
      setApps(Array.isArray(data?.apps) ? data.apps : []);
    } catch (e) {
      setError(e.message || "Could not load connected apps.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // If user is not logged in, we still show the page but disable actions.
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectedSet = useMemo(() => {
    return new Set(apps.map((a) => a.provider));
  }, [apps]);

  const handleConnect = async (provider) => {
    // For now: you can route to a “Connect” modal/page later.
    // Long-term: POST /integrations/:provider/connect should return a URL (OAuth) or instructions (API key).
    alert(
      `Connect flow for "${provider}" will be wired next.\n\nFor now, we’ll build the backend endpoint + Supabase table.`
    );
  };

  const handleDisconnect = async (provider) => {
    // Long-term: DELETE /integrations/:provider
    alert(`Disconnect flow for "${provider}" will be wired next.`);
  };

  return (
    <AppShell title="Connected Apps">
      <div className="connected-page">
        <header className="connected-header">
          <h2 className="connected-title">Connected Apps</h2>
          <p className="connected-subtitle">
            Manage integrations for market data and trading. Your keys stay on
            the server — never in the browser.
          </p>
        </header>

        {error && <div className="connected-error">{error}</div>}

        <div className="connected-grid">
          {PROVIDERS.map((p) => {
            const isConnected = connectedSet.has(p.key);
            return (
              <div className="connected-card" key={p.key}>
                <div className="connected-card-top">
                  <div>
                    <h3 className="connected-card-title">{p.name}</h3>
                    <p className="connected-card-desc">{p.desc}</p>
                  </div>

                  <span
                    className={
                      "connected-status " +
                      (isConnected
                        ? "connected-status--on"
                        : "connected-status--off")
                    }
                  >
                    {isConnected ? "Connected" : "Not connected"}
                  </span>
                </div>

                <div className="connected-tags">
                  {p.tags.map((t) => (
                    <span className="connected-tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>

                <div className="connected-actions">
                  {isConnected ? (
                    <>
                      <button
                        className="connected-btn connected-btn--secondary"
                        onClick={() => handleDisconnect(p.key)}
                        disabled={!token}
                        title={!token ? "Sign in to manage connections" : ""}
                      >
                        Disconnect
                      </button>
                      <button
                        className="connected-btn connected-btn--primary"
                        onClick={loadConnections}
                      >
                        Refresh
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="connected-btn connected-btn--primary"
                        onClick={() => handleConnect(p.key)}
                        disabled={!token}
                        title={!token ? "Sign in to connect apps" : ""}
                      >
                        Connect
                      </button>
                      <button
                        className="connected-btn connected-btn--secondary"
                        onClick={() => handleConnect(p.key)}
                        disabled={!token}
                        title={!token ? "Sign in to connect apps" : ""}
                      >
                        Learn more
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <section className="connected-note">
          <h4 className="connected-note-title">What this unlocks</h4>
          <ul className="connected-note-list">
            <li>Real-time / intraday candles for your “Real Data Layer” (#50)</li>
            <li>Provider switching + normalized candles across sources</li>
            <li>Per-user trading connections later for the Trading Engine (#51)</li>
          </ul>
        </section>

        {loading && <div className="connected-loading">Loading…</div>}
      </div>
    </AppShell>
  );
}

async function safeErrorMessage(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const data = await res.json();
      return data?.detail || `${res.status} ${res.statusText}`;
    } catch {
      return `${res.status} ${res.statusText}`;
    }
  }

  // non-JSON (likely HTML)
  const text = await res.text();
  return `Backend returned non-JSON (${res.status}). This usually means the API base URL is wrong or the route doesn't exist. First 60 chars: ${text.slice(
    0,
    60
  )}`;
}
