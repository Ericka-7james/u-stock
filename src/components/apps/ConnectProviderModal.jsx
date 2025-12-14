import { useEffect, useMemo, useState } from "react";
import "../../css/apps/ConnectProviderModal.css";
import { useAuth } from "../../context/AuthContext";

export default function ConnectProviderModal({
  open,
  provider,
  onClose,
  onGoSignIn,
}) {
  const { isAuthed, authFetch } = useAuth();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
  }, [open, provider?.key]);

  const docsUrl = useMemo(() => provider?.docsUrl || provider?.learnMoreUrl, [provider]);

  if (!open || !provider) return null;

  const handleLearnMore = () => {
    if (!docsUrl) return;
    window.open(docsUrl, "_blank", "noreferrer");
  };

  const handleConnect = async () => {
    if (!provider?.key) return;
    setErr("");
    setBusy(true);

    try {
      // Cookie-auth: authFetch already sends credentials: "include"
      const res = await authFetch(`/integrations/${provider.key}/connect`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Unable to start connection.");

      // OAuth-style: backend returns redirect URL
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      // API-key style fallback (if you implement it later)
      // If backend returns ok without url, just close for now.
      onClose?.();
    } catch (e) {
      setErr(e.message || "Connect failed.");
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
                <h4 className="cp-section-title">How connection will work</h4>
                <ul className="cp-list">
                  <li>
                    We’ll start the provider connection from the server for {provider.name}.
                  </li>
                  <li>Session is cookie-based (no tokens stored in the browser).</li>
                  <li>You can disconnect any time.</li>
                </ul>
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
                  {busy ? "Connecting…" : "Connect"}
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
