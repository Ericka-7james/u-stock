import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/authContextBase.js";
import { explainResponseError } from "../../lib/ErrorMessages";
import { CONNECTED_APPS_PAGE_COPY } from "../../content/pages/connectedAppsPage.content.ts";

const PROVIDERS = CONNECTED_APPS_PAGE_COPY.providers;

/**
 * Formats a timestamp-like value into the user's local date-time string.
 *
 * @param {string|number|Date|null|undefined} ts Raw timestamp.
 * @return {string} Formatted local date-time string or empty string.
 */
function fmtTime(ts) {
  try {
    if (!ts) return "";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  } catch {
    return "";
  }
}

/**
 * Hook for ConnectedAppsPage state and data loading.
 *
 * This keeps async integration-loading logic separate from the page markup
 * while preserving the page's original behavior and structure.
 *
 * @return {Object} Connected apps page state and handlers.
 */
export function useConnectedAppsPage() {
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
  const [lastRefreshedAtRaw, setLastRefreshedAtRaw] = useState(null);

  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [disconnectMessageOpen, setDisconnectMessageOpen] = useState(false);
  const [disconnectTargetKey, setDisconnectTargetKey] = useState(null);

  const mountedRef = useRef(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Performs a guarded state update only while mounted.
   *
   * @param {Function} fn State update callback.
   * @return {void}
   */
  const safeSet = useCallback((fn) => {
    if (!mountedRef.current) return;
    fn();
  }, []);

  const activeProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.key === activeProviderKey) || null,
    [activeProviderKey]
  );

  const lastRefreshedAt = useMemo(() => fmtTime(lastRefreshedAtRaw), [lastRefreshedAtRaw]);

  const loadConnections = useCallback(async () => {
    const myReqId = ++reqIdRef.current;

    safeSet(() => {
      setError("");
      setDismissed((current) => ({ ...current, genericError: false }));
    });

    if (!isAuthed) {
      safeSet(() => {
        setApps([]);
        setNotice("");
        setLoading(false);
        setLastRefreshedAtRaw(null);
      });
      return;
    }

    safeSet(() => setLoading(true));

    try {
      const res = await authFetch("/integrations", { method: "GET" });

      if (myReqId !== reqIdRef.current) return;

      if (res.status === 401) {
        safeSet(() => setApps([]));
        throw new Error("Session expired. Please sign in again.");
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
        setDismissed((current) => ({ ...current, notConnected: false }));
        setApps(list);
        setLastRefreshedAtRaw(Date.now());
      });
    } catch (e) {
      const ui = e?._ui;

      safeSet(() => {
        setApps([]);
        setNotice("");
        setError(
          ui ? `${ui.title}\n\n${ui.body}` : e?.message || "Could not load connected apps."
        );
      });
    } finally {
      if (myReqId === reqIdRef.current) {
        safeSet(() => setLoading(false));
      }
    }
  }, [authFetch, isAuthed, safeSet]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const statusByProvider = useMemo(() => {
    const map = new Map();

    for (const app of apps) {
      const provider = String(app?.provider || "").toLowerCase();
      const status = String(app?.status || "not_connected").toLowerCase();
      if (provider) map.set(provider, status);
    }

    return map;
  }, [apps]);

  const hasAnyConnected = useMemo(() => {
    for (const provider of PROVIDERS) {
      const status = statusByProvider.get(provider.key) || "not_connected";
      if (status === "connected") return true;
    }
    return false;
  }, [statusByProvider]);

  const notSignedInCopy = useMemo(() => {
    return PROVIDERS.length === 1
      ? CONNECTED_APPS_PAGE_COPY.banners.notSignedIn.singleProviderTemplate.replace(
          "{provider}",
          PROVIDERS[0].name
        )
      : CONNECTED_APPS_PAGE_COPY.banners.notSignedIn.multiProvider;
  }, []);

  /**
   * Opens the provider connect modal.
   *
   * @param {string} providerKey Provider identifier.
   * @return {void}
   */
  const openConnectModal = useCallback((providerKey) => {
    setActiveProviderKey(providerKey);
    setModalOpen(true);
  }, []);

  /**
   * Closes the provider connect modal.
   *
   * @return {void}
   */
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setActiveProviderKey(null);
  }, []);

  /**
   * Navigates to the auth page after closing connect modal.
   *
   * @return {void}
   */
  const goSignIn = useCallback(() => {
    closeModal();
    navigate("/auth");
  }, [closeModal, navigate]);

  /**
   * Dismisses a page banner.
   *
   * @param {"notSignedIn"|"genericError"|"notConnected"} key Banner key.
   * @return {void}
   */
  const dismissBanner = useCallback((key) => {
    setDismissed((current) => ({ ...current, [key]: true }));
  }, []);

  /**
   * Opens provider docs in a secure new tab or falls back to connect modal.
   *
   * @param {string} providerKey Provider identifier.
   * @return {void}
   */
  const openDocs = useCallback(
    (providerKey) => {
      const provider = PROVIDERS.find((item) => item.key === providerKey);

      if (provider?.docsUrl) {
        window.open(provider.docsUrl, "_blank", "noopener,noreferrer");
        return;
      }

      openConnectModal(providerKey);
    },
    [openConnectModal]
  );

  /**
   * Opens the disconnect confirmation modal.
   *
   * @param {string} providerKey Provider identifier.
   * @return {void}
   */
  const requestDisconnect = useCallback((providerKey) => {
    setDisconnectTargetKey(providerKey);
    setDisconnectModalOpen(true);
  }, []);

  /**
   * Closes the disconnect confirmation modal.
   *
   * @return {void}
   */
  const closeDisconnectModal = useCallback(() => {
    setDisconnectModalOpen(false);
  }, []);

  /**
   * Confirms disconnect and shows the informational follow-up modal.
   *
   * @return {void}
   */
  const confirmDisconnect = useCallback(() => {
    setDisconnectModalOpen(false);
    setDisconnectMessageOpen(true);
  }, []);

  /**
   * Closes the disconnect informational modal and clears selected provider.
   *
   * @return {void}
   */
  const closeDisconnectMessage = useCallback(() => {
    setDisconnectMessageOpen(false);
    setDisconnectTargetKey(null);
  }, []);

  /**
   * Opens the terms modal.
   *
   * @return {void}
   */
  const openTerms = useCallback(() => {
    setTermsOpen(true);
  }, []);

  /**
   * Closes the terms modal.
   *
   * @return {void}
   */
  const closeTerms = useCallback(() => {
    setTermsOpen(false);
  }, []);

  return {
    isAuthed,
    loading,
    apps,
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
  };
}