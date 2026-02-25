// src/components/pages/ConnectedAppsPage.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AppShell from "../layout/AppShell";
import "../../css/apps/ConnectedAppsPage.css";
import { useAuth } from "../../context/authContextBase.js";
import ConnectProviderModal from "./ConnectProviderModal";
import { useNavigate } from "react-router-dom";
import { explainResponseError } from "../../lib/errorMessages";

import ConnectedAppsSquirrel from "../../assets/pages/ConnectedAppsSquirrel.png";
import TermsModal from "../common/TermsModal";
import PageHeaderCard from "../common/PageHeaderCard";
import LoadingOverlay from "../common/LoadingOverlay";

const PROVIDERS = [
  {
    key: "alpaca",
    name: "Alpaca",
    desc: "Broker integration for paper trading and market data.",
    tags: ["Paper trading", "Broker API", "Market data"],
    docsUrl: "https://docs.alpaca.markets/",
    learnMoreLabel: "Alpaca docs",
  },
  {
    key: "polygon",
    name: "Polygon.io",
    desc: "Market data provider for aggregates and intraday pricing.",
    tags: ["Intraday candles", "Aggregates", "Real-time"],
    docsUrl: "https://polygon.io/docs",
    learnMoreLabel: "Polygon docs",
  },
  {
    key: "tradingview",
    name: "TradingView",
    desc: "Charting + alerts. Often used via webhooks and notifications.",
    tags: ["Charts", "Alerts", "Webhooks"],
    docsUrl: "https://www.tradingview.com/rest-api-spec/",
    learnMoreLabel: "TradingView API",
  },
];

function fmtTime(ts) {
  try {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export default function ConnectedAppsPage() {
  const { isAuthed, authFetch } = useAuth();
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

  const [termsOpen, setTermsOpen] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

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
        setLastRefreshedAt(null);
      });
      return;
    }

    safeSet(() => setLoading(true));

    try {
      const res = await authFetch("/integrations", { method: "GET" });

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

      const list =
        (Array.isArray(data?.items) && data.items) ||
        (Array.isArray(data?.apps) && data.apps) ||
        [];

      safeSet(() => {
        setNotice(data?.message || "");
        setDismissed((d) => ({ ...d, notConnected: false }));
        setApps(list);
        setLastRefreshedAt(Date.now());
      });
    } catch (e) {
      const ui = e?._ui;
      safeSet(() => {
        setApps([]);
        setNotice("");
        setError(ui ? `${ui.title}\n\n${ui.body}` : e?.message || "Could not load connected apps.");
      });
    } finally {
      if (myReqId !== reqIdRef.current) {
      safeSet(() => setLoading(false));
    }
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
      : "You’re not signed in. Sign in to connect and manage your integrations.";

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

  // ✅ Keep "noopener,noreferrer" for security. Update the TEST to expect it.
  const openDocs = (providerKey) => {
    const p = PROVIDERS.find((x) => x.key === providerKey);
    if (p?.docsUrl) window.open(p.docsUrl, "_blank", "noopener,noreferrer");
    else openConnectModal(providerKey);
  };

  const handleDisconnect = async (providerKey) => {
    const p = PROVIDERS.find((x) => x.key === providerKey);
    const ok = window.confirm(
      `Disconnect ${p?.name || providerKey}?\n\nThis removes the connection from Lucent. You can reconnect anytime.`
    );
    if (!ok) return;

    alert(
      "Disconnect flow will be wired next (backend endpoint). For now, reconnecting is available via Connect."
    );
  };

  return (
    <AppShell>
      <LoadingOverlay open={loading} label="Loading connections…" subtitle="Please wait…" />

      <div className="connected-page" aria-busy={loading}>
        <PageHeaderCard
          title="Connected Apps"
          subtitle="Connect brokers and market data providers to power charts and strategies."
          right={<img src={ConnectedAppsSquirrel} alt="Lucent Financial logo" className="connected-hero-logo" />}
        >
          <p className="muted">
            Add integrations like Alpaca or Polygon so Lucent can fetch pricing data and (optionally) run strategies you
            choose to enable.
          </p>

          <p className="muted small">
            Your API keys stay on the server and are never stored in the browser. You remain in control: nothing trades
            unless you explicitly turn a strategy on.
          </p>

          <div className="connected-header-actions">
            <button type="button" className="connected-link-pill" onClick={() => setTermsOpen(true)}>
              Terms &amp; usage
            </button>
          </div>

          <div className="connected-hero-meta">
            {isAuthed && lastRefreshedAt ? (
              <>Last refreshed: {fmtTime(lastRefreshedAt)}</>
            ) : (
              <>Tip: Connect at least one provider to unlock market data features.</>
            )}
          </div>

          {!isAuthed && !dismissed.notSignedIn && (
            <div style={{ marginTop: 12 }}>
              <CloseableBanner onClose={() => dismissBanner("notSignedIn")}>
                {notSignedInCopy}
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="connected-btn connected-btn--primary"
                    onClick={() => navigate("/auth")}
                  >
                    Sign in
                  </button>
                </div>
              </CloseableBanner>
            </div>
          )}
        </PageHeaderCard>

        {/* Content lane aligned with header width */}
        <div className="connected-page-wrap">
          {!!error && !dismissed.genericError && (
            <CloseableBanner onClose={() => dismissBanner("genericError")}>{error}</CloseableBanner>
          )}

          {import.meta.env.DEV && !!error && !dismissed.genericError && (
            <details className="connected-debug">
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
            <CloseableBanner onClose={() => dismissBanner("notConnected")}>{notice}</CloseableBanner>
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
                      className={"connected-status " + (isConnected ? "connected-status--on" : "connected-status--off")}
                      title={`Status: ${status}`}
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
                          type="button"
                          className="connected-btn connected-btn--secondary"
                          onClick={() => handleDisconnect(p.key)}
                          disabled={!isAuthed || loading}
                          title={!isAuthed ? "Sign in to manage connections" : ""}
                        >
                          Disconnect
                        </button>
                        <button
                          type="button"
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
                          type="button"
                          className="connected-btn connected-btn--primary"
                          onClick={() => openConnectModal(p.key)}
                          disabled={loading}
                        >
                          Connect
                        </button>

                        <button
                          type="button"
                          className="connected-btn connected-btn--secondary"
                          onClick={() => openDocs(p.key)}
                          disabled={loading}
                        >
                          {p.learnMoreLabel || "Learn more"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && isAuthed && !hasAnyConnected && (
            <div className="connected-emptyHint">
              No providers connected yet. Start with <strong>Alpaca</strong> for paper trading, or{" "}
              <strong>Polygon</strong> for dedicated market data.
            </div>
          )}

          <section className="connected-note">
            <h4 className="connected-note-title">How connections are used</h4>
            <ul className="connected-note-list">
              <li>Data providers power charts, price history, and intraday moves.</li>
              <li>Broker connections allow strategies to simulate or place trades when you enable them.</li>
              <li>You stay in control — nothing trades unless you explicitly turn a strategy on.</li>
            </ul>
          </section>

          <section className="connected-note connected-note--tight">
            <h4 className="connected-note-title">Next steps</h4>
            <ul className="connected-note-list connected-note-list--spaced">
              <li>
                Start/pause strategies in{" "}
                <button type="button" className="connected-pill" onClick={() => navigate("/bots")}>
                  Bot Runner
                </button>
              </li>
              <li>
                View recent activity in{" "}
                <button type="button" className="connected-pill" onClick={() => navigate("/datasources")}>
                  Bot Logs
                </button>
              </li>
            </ul>
          </section>

          <ConnectProviderModal
            open={modalOpen}
            provider={activeProvider}
            onClose={closeModal}
            onGoSignIn={goSignIn}
            onConnected={loadConnections}
          />

          <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
        </div>
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
          type="button"
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
