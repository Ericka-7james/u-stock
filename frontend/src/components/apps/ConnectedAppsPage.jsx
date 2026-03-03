// src/components/pages/ConnectedAppsPage.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AppShell from "../layout/AppShell";
import "../../css/apps/ConnectedAppsPage.css";
import { useAuth } from "../../context/authContextBase.js";
import ConnectProviderModal from "./ConnectProviderModal";
import { useNavigate } from "react-router-dom";
import { explainResponseError } from "../../lib/ErrorMessages";

import ConnectedAppsSquirrel from "../../assets/pages/ConnectedAppsSquirrel.png";
import TermsModal from "../common/TermsModal";
import PageHeaderCard from "../common/PageHeaderCard";
import LoadingOverlay from "../common/LoadingOverlay";

import { CONNECTED_APPS_PAGE_COPY } from "../../content/pages/connectedAppsPage.content.ts";

const PROVIDERS = CONNECTED_APPS_PAGE_COPY.providers;

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
      if (myReqId === reqIdRef.current) safeSet(() => setLoading(false));
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
      ? CONNECTED_APPS_PAGE_COPY.banners.notSignedIn.singleProviderTemplate.replace(
          "{provider}",
          PROVIDERS[0].name
        )
      : CONNECTED_APPS_PAGE_COPY.banners.notSignedIn.multiProvider;

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

    const title = CONNECTED_APPS_PAGE_COPY.confirmations.disconnectTitleTemplate.replace(
      "{provider}",
      p?.name || providerKey
    );

    const ok = window.confirm(`${title}\n\n${CONNECTED_APPS_PAGE_COPY.confirmations.disconnectBody}`);
    if (!ok) return;

    alert(CONNECTED_APPS_PAGE_COPY.confirmations.disconnectNotYetWired);
  };

  return (
    <AppShell>
      <LoadingOverlay open={loading} label="Loading connections…" subtitle="Please wait…" />

      <div className="connected-page" aria-busy={loading}>
        <PageHeaderCard
          title={CONNECTED_APPS_PAGE_COPY.header.title}
          subtitle={CONNECTED_APPS_PAGE_COPY.header.subtitle}
          right={<img src={ConnectedAppsSquirrel} alt="Lucent Financial logo" className="connected-hero-logo" />}
        >
          <p className="muted">{CONNECTED_APPS_PAGE_COPY.hero.primary}</p>

          <p className="muted small">{CONNECTED_APPS_PAGE_COPY.hero.secondary}</p>

          <div className="connected-header-actions">
            <button type="button" className="connected-link-pill" onClick={() => setTermsOpen(true)}>
              {CONNECTED_APPS_PAGE_COPY.hero.termsCta}
            </button>
          </div>

          <div className="connected-hero-meta">
            {isAuthed && lastRefreshedAt ? (
              <>
                {CONNECTED_APPS_PAGE_COPY.hero.refreshedLabel} {fmtTime(lastRefreshedAt)}
              </>
            ) : (
              <>{CONNECTED_APPS_PAGE_COPY.hero.tipWhenNotRefreshed}</>
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
                    {CONNECTED_APPS_PAGE_COPY.banners.notSignedIn.cta}
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
                      {isConnected ? CONNECTED_APPS_PAGE_COPY.statuses.connected : CONNECTED_APPS_PAGE_COPY.statuses.notConnected}
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
                          {CONNECTED_APPS_PAGE_COPY.actions.disconnect}
                        </button>
                        <button
                          type="button"
                          className="connected-btn connected-btn--primary"
                          onClick={loadConnections}
                          disabled={!isAuthed || loading}
                          title={!isAuthed ? "Sign in first" : ""}
                        >
                          {CONNECTED_APPS_PAGE_COPY.actions.refresh}
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
                          {p.connectLabel || "Connect"}
                        </button>

                        <button
                          type="button"
                          className="connected-btn connected-btn--secondary"
                          onClick={() => openDocs(p.key)}
                          disabled={loading}
                        >
                          {p.learnMoreLabel || CONNECTED_APPS_PAGE_COPY.actions.learnMoreFallback}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && isAuthed && !hasAnyConnected && (
            <div className="connected-emptyHint">{CONNECTED_APPS_PAGE_COPY.emptyState.hint}</div>
          )}

          <section className="connected-note">
            <h4 className="connected-note-title">{CONNECTED_APPS_PAGE_COPY.info.howTitle}</h4>
            <ul className="connected-note-list">
              {CONNECTED_APPS_PAGE_COPY.info.howItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>

          <section className="connected-note connected-note--tight">
            <h4 className="connected-note-title">{CONNECTED_APPS_PAGE_COPY.info.nextTitle}</h4>
            <ul className="connected-note-list connected-note-list--spaced">
              {CONNECTED_APPS_PAGE_COPY.info.nextItems.map((it) => (
                <li key={it.to}>
                  {it.prefix}{" "}
                  <button type="button" className="connected-pill" onClick={() => navigate(it.to)}>
                    {it.ctaLabel}
                  </button>
                </li>
              ))}
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