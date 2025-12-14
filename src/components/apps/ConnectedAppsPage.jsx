import { useEffect, useMemo, useState } from "react";
import AppShell from "../layout/AppShell";
import "../../css/apps/ConnectedAppsPage.css";
import { useAuth } from "../../context/AuthContext";
import ConnectProviderModal from "./ConnectProviderModal";
import { useNavigate } from "react-router-dom";

const PROVIDERS = [
  {
    key: "alpaca",
    name: "Alpaca",
    desc: "Paper trading + live market data (great for prototyping).",
    tags: ["Paper trading", "Market data"],
    docsUrl: "https://docs.alpaca.markets/",
  },
  {
    key: "polygon",
    name: "Polygon.io",
    desc: "Professional-grade market data + aggregates.",
    tags: ["Intraday candles", "Real-time"],
    docsUrl: "https://polygon.io/docs",
  },
  {
    key: "tradingview",
    name: "TradingView",
    desc: "Charts + alerts (usually via webhooks).",
    tags: ["Alerts", "Webhooks"],
    docsUrl: "https://www.tradingview.com/rest-api-spec/",
  },
];

export default function ConnectedAppsPage() {
  const { isAuthed, authFetch, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState([]);
  const [error, setError] = useState("");

  const [dismissed, setDismissed] = useState({
    notSignedIn: false,
    genericError: false,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [activeProviderKey, setActiveProviderKey] = useState(null);

  const activeProvider = useMemo(
    () => PROVIDERS.find((p) => p.key === activeProviderKey) || null,
    [activeProviderKey]
  );

  async function loadConnections() {
    setError("");
    setDismissed((d) => ({ ...d, genericError: false }));

    if (!isAuthed) {
      setApps([]);
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch("/integrations", { method: "GET" });

      if (res.status === 401) {
        // session cookie missing/expired
        setApps([]);
        throw new Error("Session expired — please sign in again.");
      }
      if (!res.ok) {
        const msg = await safeErrorMessage(res);
        throw new Error(msg);
      }

      const data = await res.json();

      // Debug: uncomment if you want to see exactly what backend returns
      // console.log("integrations response:", data);

      setApps(Array.isArray(data?.apps) ? data.apps : []);
    } catch (e) {
      setApps([]);
      setError(e?.message || "Could not load connected apps.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  // ✅ Stronger than a Set: always use status field
  const statusByProvider = useMemo(() => {
    const map = new Map();
    for (const a of apps) {
      // Normalize just in case backend changes later
      const provider = String(a?.provider || "").toLowerCase();
      const status = String(a?.status || "not_connected").toLowerCase();
      if (provider) map.set(provider, status);
    }
    return map;
  }, [apps]);

  const providerCount = PROVIDERS.length;
  const notSignedInCopy =
    providerCount === 1
      ? `You’re not signed in. Sign in to connect ${PROVIDERS[0].name}.`
      : "You’re not signed in. Sign in to connect and manage apps.";

  const openConnectModal = (providerKey) => {
    setActiveProviderKey(providerKey);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveProviderKey(null);
  };

  const goSignIn = () => {
    closeModal();
    navigate("/auth");
  };

  const dismissBanner = (key) => {
    setDismissed((d) => ({ ...d, [key]: true }));
  };

  const openDocs = (providerKey) => {
    const p = PROVIDERS.find((x) => x.key === providerKey);
    if (p?.docsUrl) window.open(p.docsUrl, "_blank", "noreferrer");
    else openConnectModal(providerKey);
  };

  const handleLogout = async () => {
    // Clears cookie session (your cookie-auth backend supports this)
    await logout?.();
    // after logout, statuses should clear
    setApps([]);
  };

  return (
    <AppShell title="Connected Apps">
      <div className="connected-page">
        <header className="connected-header">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 className="connected-title">Connected Apps</h2>
              <p className="connected-subtitle">
                Manage integrations for market data and trading. Your credentials stay
                on the server — never in the browser.
              </p>
            </div>

            {/* Handy while you’re testing cookie sessions */}
            {isAuthed && (
              <button
                className="connected-btn connected-btn--secondary"
                onClick={handleLogout}
                title="Clears the HttpOnly cookie session"
                style={{ height: 40, alignSelf: "flex-start" }}
              >
                Log out
              </button>
            )}
          </div>

          {!isAuthed && !dismissed.notSignedIn && (
            <CloseableBanner onClose={() => dismissBanner("notSignedIn")}>
              {notSignedInCopy}
            </CloseableBanner>
          )}
        </header>

        {!!error && !dismissed.genericError && (
          <CloseableBanner onClose={() => dismissBanner("genericError")}>
            {error}
          </CloseableBanner>
        )}

        <div className="connected-grid">
          {PROVIDERS.map((p) => {
            const status = statusByProvider.get(p.key) || "not_connected";
            const isConnected = status === "connected";

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
                    title={`backend status: ${status}`}
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
                        onClick={() => alert("Disconnect flow will be wired next.")}
                        disabled={!isAuthed}
                        title={!isAuthed ? "Sign in to manage connections" : ""}
                      >
                        Disconnect
                      </button>
                      <button
                        className="connected-btn connected-btn--primary"
                        onClick={loadConnections}
                        disabled={!isAuthed}
                        title={!isAuthed ? "Sign in first" : ""}
                      >
                        Refresh
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="connected-btn connected-btn--primary"
                        onClick={() => openConnectModal(p.key)}
                      >
                        Connect
                      </button>

                      <button
                        className="connected-btn connected-btn--secondary"
                        onClick={() => openDocs(p.key)}
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

        <ConnectProviderModal
          open={modalOpen}
          provider={activeProvider}
          onClose={closeModal}
          onGoSignIn={goSignIn}
        />
      </div>
    </AppShell>
  );
}

function CloseableBanner({ children, onClose }) {
  return (
    <div className="connected-error" style={{ whiteSpace: "pre-wrap" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>{children}</div>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          style={{
            border: 0,
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            opacity: 0.85,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    </div>
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

  const text = await res.text();
  return `Backend returned non-JSON (${res.status}). First 60 chars: ${text.slice(0, 60)}`;
}
