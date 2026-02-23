// src/components/common/ErrorMessages.jsx
import { useEffect, useMemo } from "react";
import "../../css/common/ErrorMessage.css";


/**
 * Common modal used by Signup + NavBar-like dialogs.
 *
 * Props:
 * - open: boolean
 * - error: {
 *    title?: string,
 *    body?: string,
 *    subtitle?: string,
 *    image?: string, // optional hero image (transparent png recommended)
 *    action?: { label: string, href?: string } | null
 *   } | null
 * - onClose: () => void
 * - onAction: (action) => void
 */
export default function ErrorModal({ open, error, onClose, onAction }) {
  const safe = useMemo(() => {
    if (!error) return null;
    return {
      title: error.title || "Uh oh!",
      body: error.body || "Something went wrong.",
      subtitle: error.subtitle || "",
      image: error.image || null,
      action: error.action || null,
    };
  }, [error]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !safe) return null;

  const handleOverlayClick = () => onClose?.();
  const stop = (e) => e.stopPropagation();

  const hasAction = !!safe.action?.label;

  return (
    <div className="ustock-em-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="ustock-em-modal" onClick={stop}>
        <div className="ustock-em-hero">
          {/*
            TODO(ui): Close (X) icon is vertically misaligned due to a global CSS override.
            Revisit when auditing global button/reset styles
            Visual impact is minor; functionality is correct. 
          */}
          <button
            type="button"
            className="ustock-em-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          />
          {safe.image ? <img className="ustock-em-heroImg" src={safe.image} alt="" draggable="false" /> : null}
        </div>

        <div className="ustock-em-body">
          <h2 className="ustock-em-title">{safe.title}</h2>
          {safe.body ? <p className="ustock-em-text">{safe.body}</p> : null}
          {safe.subtitle ? <p className="ustock-em-sub">{safe.subtitle}</p> : null}

          <div className="ustock-em-actions">
            <button type="button" className="ustock-em-btn ustock-em-btn--secondary" onClick={onClose}>
              Close
            </button>

            {hasAction ? (
              <button
                type="button"
                className="ustock-em-btn ustock-em-btn--primary"
                onClick={() => onAction?.(safe.action)}
              >
                {safe.action.label}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
