import { useEffect, useMemo, useRef, useState } from "react";
import "../../css/apps/ConnectProviderModal.css";
import { useAuth } from "../../context/authContextBase.js";

export default function ConnectProviderModal({
  open,
  provider,
  onClose,
  onGoSignIn,
  onConnected,
}) {
  const { isAuthed, authFetch } = useAuth();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState("paper"); // alpaca only
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState(""); // alpaca only

  const apiKeyRef = useRef(null);

  const docsUrl = useMemo(
    () => provider?.docsUrl || provider?.learnMoreUrl || "",
    [provider]
  );

  const isAlpaca = provider?.key === "alpaca";
  const isPolygon = provider?.key === "polygon";

  // Escape key closes (unless busy)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  // reset modal state when opening / switching providers
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setErr("");
    setMode("paper");
    setApiKey("");
    setApiSecret("");
  }, [open, provider?.key]);

  // autofocus first field when authed + open
  useEffect(() => {
    if (!open) return;
    if (!isAuthed) return;
    const t = setTimeout(() => apiKeyRef.current?.focus?.(), 0);
    return () => clearTimeout(t);
  }, [open, isAuthed, provider?.key]);

  if (!open || !provider) return null;

  const handleLearnMore = () => {
    if (!docsUrl) return;
    window.open(docsUrl, "_blank", "noreferrer");
  };

  const handleConnect = async () => {
    if (busy) return; // prevent double submit
    setErr("");

    if (!apiKey.trim()) {
      setErr("API key is required.");
      return;
    }
    if (isAlpaca && !apiSecret.trim()) {
      setErr("API secret is required for Alpaca.");
      return;
    }

    setBusy(true);
    try {
      let path = "";
      let body = {};

      if (isAlpaca) {
        path = "/integrations/alpaca/keys";
        body = {
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
          mode,
        };
      } else if (isPolygon) {
        path = "/integrations/polygon/keys";
        body = { api_key: apiKey.trim() };
      } else {
        setErr("This provider does not support API key connections yet.");
        return;
      }

      const res = await authFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Failed to save API keys.");

      await onConnected?.();
      onClose?.();
    } catch (e) {
      setErr(e?.message || "Failed to connect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="cp-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="cp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Connect ${provider.name}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="cp-modal-header">
          <div>
            <h3 className="cp-modal-title">Connect {provider.name}</h3>
            <p className="cp-modal-subtitle">{provider.desc}</p>
          </div>

          <button
            className="cp-modal-x"
            onClick={() => !busy && onClose?.()}
            aria-label="Close"
            disabled={busy}
            title={busy ? "Saving…" : "Close"}
          >
            ✕
          </button>
        </header>

        <div className="cp-modal-body">
          {!isAuthed ? (
            <div className="cp-callout">
              <div className="cp-callout-title">Sign in required</div>
              <p className="cp-callout-text">
                To connect {provider.name}, you’ll need to sign in so we can save your
                integration securely on the server.
              </p>

              <div className="cp-actions">
                <button className="cp-btn cp-btn--primary" onClick={onGoSignIn}>
                  Go to Sign In
                </button>
                <button className="cp-btn cp-btn--secondary" onClick={onClose}>
                  Not now
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="cp-section">
                <h4 className="cp-section-title">API keys</h4>

                {isAlpaca && (
                  <div className="cp-field">
                    <label className="cp-label">Mode</label>
                    <select
                      className="cp-input"
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                      disabled={busy}
                    >
                      <option value="paper">Paper</option>
                      <option value="live">Live</option>
                    </select>
                  </div>
                )}

                <div className="cp-field">
                  <label className="cp-label">API Key</label>
                  <input
                    ref={apiKeyRef}
                    className="cp-input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your API key"
                    autoComplete="off"
                    disabled={busy}
                    inputMode="text"
                  />
                </div>

                {isAlpaca && (
                  <div className="cp-field">
                    <label className="cp-label">API Secret</label>
                    <input
                      className="cp-input"
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="Paste your API secret"
                      autoComplete="off"
                      disabled={busy}
                      inputMode="text"
                    />
                  </div>
                )}

                <p className="cp-muted">
                  Keys are stored server-side (not in the browser). You can disconnect any time.
                </p>
              </div>

              {err && (
                <div className="cp-callout" style={{ marginTop: 12 }}>
                  <div className="cp-callout-title">Couldn’t connect</div>
                  <p className="cp-callout-text">{err}</p>
                </div>
              )}

              <div className="cp-actions">
                <button
                  className="cp-btn cp-btn--primary"
                  onClick={handleConnect}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save & Connect"}
                </button>

                <button
                  className="cp-btn cp-btn--secondary"
                  onClick={handleLearnMore}
                  disabled={busy || !docsUrl}
                >
                  Learn more
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
