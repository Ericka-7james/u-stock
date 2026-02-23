// frontend/src/components/common/Modal.jsx
import { useEffect, useState } from "react";
import "../../css/common/Modal.css";

function getTheme() {
  if (typeof document === "undefined") return "light";
  const t =
    document.documentElement?.dataset?.theme ||
    document.body?.dataset?.theme ||
    "";
  return String(t).toLowerCase() === "dark" ? "dark" : "light";
}

export default function Modal({ open, title, children, onClose, footer = null }) {
  const [theme, setTheme] = useState(getTheme());

  useEffect(() => {
    if (!open) return;

    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }

    // Sync theme on open + whenever the html/body theme attribute changes
    const syncTheme = () => setTheme(getTheme());
    syncTheme();

    window.addEventListener("keydown", onKey);

    const mo = new MutationObserver(syncTheme);
    // Most apps toggle theme on <html data-theme="dark">
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    // Fallback if you ever toggle on body instead
    if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });

    return () => {
      window.removeEventListener("keydown", onKey);
      mo.disconnect();
    };
  }, [open, onClose]);

  if (!open) return null;

  const isDark = theme === "dark";

  return (
    <div
      className={`mOverlay ${isDark ? "theme-dark" : "theme-light"}`}
      data-theme={theme}
      role="dialog"
      aria-modal="true"
    >
      <div className="mBackdrop" onClick={onClose} />
      <div className="mCard">
        <div className="mHead">
          <div className="mTitle">{title}</div>
          <button className="mClose" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mBody">{children}</div>

        {footer ? <div className="mFoot">{footer}</div> : null}
      </div>
    </div>
  );
}