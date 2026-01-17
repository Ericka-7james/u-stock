// src/components/common/HelpTooltip.jsx
import { useEffect, useRef, useState } from "react";
import "../../css/common/HelpTooltip.css";

export default function HelpTooltip({ title = "Help", children }) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    // focus close for accessibility
    closeBtnRef.current?.focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="help-icon-button"
        aria-label={title}
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      {open && (
        <div
          className="help-popover-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="help-popover"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeBtnRef}
              type="button"
              className="help-popover__close"
              aria-label="Close help"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <h3 className="help-popover__title">{title}</h3>
            <div className="help-popover__body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
