// frontend/src/components/common/Modal.jsx
import { useEffect } from "react";
import "../../css/common/Modal.css";

export default function Modal({ open, title, children, onClose, footer = null }) {
  useEffect(() => {
    if (!open) return;

    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mOverlay" role="dialog" aria-modal="true">
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
