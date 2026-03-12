import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell";
import "../../css/apps/ConnectedAppsPage.css";

import AppImage from "../common/AppImage.jsx";
import ContentCard from "../common/ContentCard.jsx";
import LoadingOverlay from "../common/LoadingOverlay";
import Modal from "../common/Modal";
import PageHeaderCard from "../common/PageHeaderCard";
import TermsModal from "../common/TermsModal";
import ConnectProviderModal from "./ConnectProviderModal";

import ConnectedAppsSquirrel from "../../assets/pages/ConnectedAppsSquirrel.png";

import { CONNECTED_APPS_PAGE_COPY } from "../../content/pages/connectedAppsPage.content.ts";
import { useConnectedAppsPage } from "../../hooks/app/useConnectedAppsPage.js";
const PROVIDERS = CONNECTED_APPS_PAGE_COPY.providers;

/**
 * Connected apps settings page.
 *
 * This page renders supported integration providers, connection status,
 * onboarding guidance, and provider actions using shared page primitives.
 *
 * Shared UI primitives used here:
 * - PageHeaderCard
 * - Modal
 * - AppImage
 * - ContentCard
 *
 * @return {JSX.Element} Connected apps page.
 */
export default function ConnectedAppsPage() {
  const navigate = useNavigate();

  const {
    isAuthed,
    loading,
    error,
    notice,
    dismissed,
    modalOpen,
    activeProvider,
    termsOpen,
    lastRefreshedAt,
    statusByProvider,
    hasAnyConnected,
    notSignedInCopy,
    disconnectModalOpen,
    disconnectMessageOpen,
    disconnectTargetKey,
    openConnectModal,
    closeModal,
    goSignIn,
    dismissBanner,
    openDocs,
    requestDisconnect,
    closeDisconnectModal,
    confirmDisconnect,
    closeDisconnectMessage,
    openTerms,
    closeTerms,
    loadConnections,
  } = useConnectedAppsPage();

  const disconnectTitle = useMemo(() => {
    const provider = PROVIDERS.find((item) => item.key === disconnectTargetKey);
    return CONNECTED_APPS_PAGE_COPY.confirmations.disconnectTitleTemplate.replace(
      "{provider}",
      provider?.name || disconnectTargetKey || "provider"
    );
  }, [disconnectTargetKey]);

  return (
    <AppShell>
      <LoadingOverlay open={loading} label="Loading connections…" subtitle="Please wait…" />

      <div className="connected-page" aria-busy={loading}>
        <PageHeaderCard
          title={CONNECTED_APPS_PAGE_COPY.header.title}
          subtitle={CONNECTED_APPS_PAGE_COPY.header.subtitle}
          right={
            <AppImage
              src={ConnectedAppsSquirrel}
              alt="Lucent Financial logo"
              className="connected-hero-logo"
              loading="eager"
              decoding="async"
            />
          }
        >
          <p className="muted">{CONNECTED_APPS_PAGE_COPY.hero.primary}</p>

          <p className="muted small">{CONNECTED_APPS_PAGE_COPY.hero.secondary}</p>

          <div className="connected-header-actions">
            <button type="button" className="connected-link-pill" onClick={openTerms}>
              {CONNECTED_APPS_PAGE_COPY.hero.termsCta}
            </button>
          </div>

          <div className="connected-hero-meta">
            {isAuthed && lastRefreshedAt ? (
              <>
                {CONNECTED_APPS_PAGE_COPY.hero.refreshedLabel} {lastRefreshedAt}
              </>
            ) : (
              <>{CONNECTED_APPS_PAGE_COPY.hero.tipWhenNotRefreshed}</>
            )}
          </div>

          {!isAuthed && !dismissed.notSignedIn ? (
            <div className="connected-banner-slot">
              <CloseableBanner onClose={() => dismissBanner("notSignedIn")}>
                {notSignedInCopy}
                <div className="connected-banner-actions">
                  <button
                    type="button"
                    className="connected-btn connected-btn--primary"
                    onClick={goSignIn}
                  >
                    {CONNECTED_APPS_PAGE_COPY.banners.notSignedIn.cta}
                  </button>
                </div>
              </CloseableBanner>
            </div>
          ) : null}
        </PageHeaderCard>

        <div className="connected-page-wrap">
          {!!error && !dismissed.genericError ? (
            <CloseableBanner onClose={() => dismissBanner("genericError")}>
              {error}
            </CloseableBanner>
          ) : null}

          {import.meta.env.DEV && !!error && !dismissed.genericError ? (
            <details className="connected-debug">
              <summary>Debug tips</summary>
              <div className="connected-debug-copy">
                If this is local dev:
                {"\n"}- confirm backend is running on :8000
                {"\n"}- confirm cookies are being set (Network tab → auth/login)
                {"\n"}- confirm proxy is active (vite.config.js)
              </div>
            </details>
          ) : null}

          {isAuthed && !!notice && !dismissed.notConnected && !hasAnyConnected ? (
            <CloseableBanner onClose={() => dismissBanner("notConnected")} variant="notice">
              {notice}
            </CloseableBanner>
          ) : null}

          <div className="connected-grid">
            {PROVIDERS.map((provider) => {
              const status = statusByProvider.get(provider.key) || "not_connected";
              const isConnected = status === "connected";

              return (
                <ContentCard as="article" className="connected-card" key={provider.key}>
                  <div className="connected-card-top">
                    <div className="u-min-0">
                      <h3 className="connected-card-title">{provider.name}</h3>
                      <p className="connected-card-desc">{provider.desc}</p>
                    </div>

                    <span
                      className={
                        "connected-status " +
                        (isConnected ? "connected-status--on" : "connected-status--off")
                      }
                      title={`Status: ${status}`}
                    >
                      {isConnected
                        ? CONNECTED_APPS_PAGE_COPY.statuses.connected
                        : CONNECTED_APPS_PAGE_COPY.statuses.notConnected}
                    </span>
                  </div>

                  <div className="connected-tags">
                    {provider.tags.map((tag) => (
                      <span className="connected-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="connected-actions">
                    {isConnected ? (
                      <>
                        <button
                          type="button"
                          className="connected-btn connected-btn--secondary"
                          onClick={() => requestDisconnect(provider.key)}
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
                          onClick={() => openConnectModal(provider.key)}
                          disabled={loading}
                        >
                          {provider.connectLabel || "Connect"}
                        </button>

                        <button
                          type="button"
                          className="connected-btn connected-btn--secondary"
                          onClick={() => openDocs(provider.key)}
                          disabled={loading}
                        >
                          {provider.learnMoreLabel ||
                            CONNECTED_APPS_PAGE_COPY.actions.learnMoreFallback}
                        </button>
                      </>
                    )}
                  </div>
                </ContentCard>
              );
            })}
          </div>

          {!loading && isAuthed && !hasAnyConnected ? (
            <div className="connected-emptyHint">
              {CONNECTED_APPS_PAGE_COPY.emptyState.hint}
            </div>
          ) : null}

          <ContentCard as="section" className="connected-note">
            <h4 className="connected-note-title">{CONNECTED_APPS_PAGE_COPY.info.howTitle}</h4>
            <ul className="connected-note-list">
              {CONNECTED_APPS_PAGE_COPY.info.howItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ContentCard>

          <ContentCard as="section" className="connected-note connected-note--tight">
            <h4 className="connected-note-title">{CONNECTED_APPS_PAGE_COPY.info.nextTitle}</h4>
            <ul className="connected-note-list connected-note-list--spaced">
              {CONNECTED_APPS_PAGE_COPY.info.nextItems.map((item) => (
                <li key={item.to}>
                  {item.prefix}{" "}
                  <button
                    type="button"
                    className="connected-pill"
                    onClick={() => navigate(item.to)}
                  >
                    {item.ctaLabel}
                  </button>
                </li>
              ))}
            </ul>
          </ContentCard>

          <ConnectProviderModal
            open={modalOpen}
            provider={activeProvider}
            onClose={closeModal}
            onGoSignIn={goSignIn}
            onConnected={loadConnections}
          />

          <Modal
            open={disconnectModalOpen}
            title={disconnectTitle}
            onClose={closeDisconnectModal}
            footer={
              <div className="connected-modal-footer">
                <button
                  type="button"
                  className="connected-btn connected-btn--secondary"
                  onClick={closeDisconnectModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="connected-btn connected-btn--primary"
                  onClick={confirmDisconnect}
                >
                  Disconnect
                </button>
              </div>
            }
          >
            <div className="connected-modal-copy">
              {CONNECTED_APPS_PAGE_COPY.confirmations.disconnectBody}
            </div>
          </Modal>

          <Modal
            open={disconnectMessageOpen}
            title="Disconnect not yet available"
            onClose={closeDisconnectMessage}
            footer={
              <div className="connected-modal-footer">
                <button
                  type="button"
                  className="connected-btn connected-btn--primary"
                  onClick={closeDisconnectMessage}
                >
                  Close
                </button>
              </div>
            }
          >
            <div className="connected-modal-copy">
              {CONNECTED_APPS_PAGE_COPY.confirmations.disconnectNotYetWired}
            </div>
          </Modal>

          <TermsModal open={termsOpen} onClose={closeTerms} />
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Closeable banner for page-level notices and errors.
 *
 * @param {Object} props Component props.
 * @param {React.ReactNode} props.children Banner content.
 * @param {"error"|"notice"} [props.variant="error"] Banner style variant.
 * @param {Function} props.onClose Dismiss handler.
 * @return {JSX.Element} Banner.
 */
function CloseableBanner({ children, variant = "error", onClose }) {
  const className =
    variant === "notice"
      ? "connected-error connected-error--notice"
      : "connected-error";

  return (
    <div className={className}>
      <div className="connected-banner-row">
        <div className="connected-banner-content">{children}</div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="connected-banner-close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}