import { useEffect, useMemo, useState } from "react";
import "../../css/apps/ConnectProviderModal.css";
import { useAuth } from "../../context/AuthContext";

export default function ConnectProviderModal({
  open,
  provider,
  onClose,
  onGoSignIn,
  onConnected, // ✅ add this so ConnectedAppsPage can refresh after save
}) {
  const { isAuthed, authFetch } = useAuth();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ✅ form state
  const [mode, setMode] = useState("paper"); // alpaca only
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState(""); // alpaca only

  const docsUrl = useMemo(
    () => provider?.docsUrl || provider?.learnMoreUrl,
    [provider]
  );

  const isAlpaca = provider?.key === "alpaca";
  const isPolygon = provider?.key === "polygon";

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // reset modal state when opening / switching providers
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setErr("");
    setMode("paper");
    setApiKey("");
    setApiSecret("");
  }, [open, provider?.key]);

  if (!open || !provider) return null;

  const handleLearnMore = () => {
    if (!docsUrl) return;
    window.open(docsUrl, "_blank", "noreferrer");
  };

  const handleConnect = async () => {
    setErr("");

    // basic validation
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
        body = {
          api_key: apiKey.trim(),
        };
      } else {
        setErr("This provider does not support API key connections yet.");
        setBusy(false);
        return;
      }

      const res = await authFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Failed to save API keys.");

      await onConnected?.(); // ✅ refresh list
      onClose?.();
    } catch (e) {
      setErr(e?.message || "Failed to connect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cp-modal-overlay" onMouseDown={onClose} role="presentation">
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

          <button className="cp-modal-x" onClick={onClose} aria-label="Close">
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
                    >
                      <option value="paper">Paper</option>
                      <option value="live">Live</option>
                    </select>
                  </div>
                )}

                <div className="cp-field">
                  <label className="cp-label">API Key</label>
                  <input
                    className="cp-input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your API key"
                    autoComplete="off"
                  />
                </div>

                {isAlpaca && (
                  <div className="cp-field">
                    <label className="cp-label">API Secret</label>
                    <input
                      className="cp-input"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="Paste your API secret"
                      autoComplete="off"
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
                  disabled={!docsUrl}
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
