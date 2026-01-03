import { useState } from "react";
import "../../css/common/HelpTooltip.css";

export default function HelpTooltip({ title = "Help", children }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Tiny "?" button that opens the help modal */}
      <button
        type="button"
        className="help-icon-button"
        aria-label={title}
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      {/* Full-screen popover/modal */}
      {open && (
        <div
          className="help-popover-backdrop"
          onClick={() => setOpen(false)}
        >
          <div
            className="help-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <button
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
