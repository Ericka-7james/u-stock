import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AppShell from "../layout/AppShell";
import "../../css/apps/ConnectedAppsPage.css";
import { useAuth } from "../../context/AuthContext";
import ConnectProviderModal from "./ConnectProviderModal";
import { useNavigate } from "react-router-dom";
import { explainResponseError } from "../common/errorMessages";

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
  const [notice, setNotice] = useState("");

  const [dismissed, setDismissed] = useState({
    notSignedIn: false,
    genericError: false,
    notConnected: false,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [activeProviderKey, setActiveProviderKey] = useState(null);

  // Guard against setting state after unmount + avoid racey responses
  const mountedRef = useRef(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const activeProvider = useMemo(
    () => PROVIDERS.find((p) => p.key === activeProviderKey) || null,
    [activeProviderKey]
  );

  const safeSet = useCallback((fn) => {
    if (!mountedRef.current) return;
    fn();
  }, []);

  const loadConnections = useCallback(async () => {
    const myReqId = ++reqIdRef.current;

    safeSet(() => {
      setError("");
      setDismissed((d) => ({ ...d, genericError: false }));
    });

    if (!isAuthed) {
      safeSet(() => {
        setApps([]);
        setNotice("");
        setLoading(false);
      });
      return;
    }

    safeSet(() => setLoading(true));

    try {
      const res = await authFetch("/integrations", { method: "GET" });

      // If a newer request started, ignore this response
      if (myReqId !== reqIdRef.current) return;

      if (res.status === 401) {
        safeSet(() => setApps([]));
        throw new Error("Session expired — please sign in again.");
      }

      if (!res.ok) {
        const ui = await explainResponseError(res, { feature: "integrations_list" });
        const err = new Error(ui.body);
        err._ui = ui;
        throw err;
      }

      const data = await res.json().catch(() => ({}));

      // backend returns { items: [...] } (support legacy { apps: [...] })
      const list =
        (Array.isArray(data?.items) && data.items) ||
        (Array.isArray(data?.apps) && data.apps) ||
        [];

      safeSet(() => {
        setNotice(data?.message || "");
        setDismissed((d) => ({ ...d, notConnected: false }));
        setApps(list);
      });
    } catch (e) {
      const ui = e?._ui;
      safeSet(() => {
        setApps([]);
        setNotice("");
        setError(
          ui ? `${ui.title}\n\n${ui.body}` : (e?.message || "Could not load connected apps.")
        );
      });
    } finally {
      // If a newer request started, don't stomp its loading state
      if (myReqId !== reqIdRef.current) return;
      safeSet(() => setLoading(false));
    }
  }, [authFetch, isAuthed, safeSet]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const statusByProvider = useMemo(() => {
    const map = new Map();
    for (const a of apps) {
      const provider = String(a?.provider || "").toLowerCase();
      const status = String(a?.status || "not_connected").toLowerCase();
      if (provider) map.set(provider, status);
    }
    return map;
  }, [apps]);

  const hasAnyConnected = useMemo(() => {
    for (const p of PROVIDERS) {
      const status = statusByProvider.get(p.key) || "not_connected";
      if (status === "connected") return true;
    }
    return false;
  }, [statusByProvider]);

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
    try {
      await logout?.();
    } finally {
      // clear local UI regardless
      setApps([]);
      setNotice("");
    }
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

            {isAuthed && (
              <button
                className="connected-btn connected-btn--secondary"
                onClick={handleLogout}
                title="Clears the HttpOnly cookie session"
                style={{ height: 40, alignSelf: "flex-start" }}
                disabled={loading}
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

        {import.meta.env.DEV && !!error && !dismissed.genericError && (
          <details style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            <summary>Debug tips</summary>
            <div style={{ whiteSpace: "pre-wrap" }}>
              If this is local dev:
              {"\n"}- confirm backend is running on :8000
              {"\n"}- confirm cookies are being set (Network tab → auth/login)
              {"\n"}- confirm proxy is active (vite.config.js)
            </div>
          </details>
        )}

        {isAuthed && !!notice && !dismissed.notConnected && !hasAnyConnected && (
          <CloseableBanner onClose={() => dismissBanner("notConnected")}>
            {notice}
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
                      (isConnected ? "connected-status--on" : "connected-status--off")
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
                        disabled={!isAuthed || loading}
                        title={!isAuthed ? "Sign in to manage connections" : ""}
                      >
                        Disconnect
                      </button>
                      <button
                        className="connected-btn connected-btn--primary"
                        onClick={loadConnections}
                        disabled={!isAuthed || loading}
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
                        disabled={loading}
                      >
                        Connect
                      </button>

                      <button
                        className="connected-btn connected-btn--secondary"
                        onClick={() => openDocs(p.key)}
                        disabled={loading}
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
          onConnected={loadConnections}
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
