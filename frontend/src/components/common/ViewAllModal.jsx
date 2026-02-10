// frontend/src/components/common/ViewAllModal.jsx
import { useEffect } from "react";
import "../../../src/css/common/ViewAllModal.css";

/**
 * Common "View all" popup with consistent styling.
 * - Click backdrop to close
 * - Esc to close
 * - Header w/ title + subtitle + X button
 * - Optional footer
 */
export default function ViewAllModal({
  open,
  title = "View all",
  subtitle = "",
  onClose,
  children,
  footer = null,
  maxWidth = 760, // matches your MarketLeaders modal vibe
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);

    // lock scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="vaBackdrop" onClick={() => onClose?.()} role="presentation">
      <div
        className="vaModal"
        style={{ width: `min(${maxWidth}px, 96vw)` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="vaHeader">
          <div className="vaHeaderText">
            <div className="vaTitle">{title}</div>
            {subtitle ? <div className="vaSubtitle">{subtitle}</div> : null}
          </div>

          <button type="button" className="vaClose" onClick={() => onClose?.()} aria-label="Close">
            ×
          </button>
        </div>

        <div className="vaBody">{children}</div>

        {footer ? <div className="vaFooter">{footer}</div> : null}
      </div>
    </div>
  );
}
