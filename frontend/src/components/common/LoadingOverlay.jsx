// src/components/common/LoadingOverlay.jsx
import React from "react";
import "../../css/common/LoadingOverlay.css";

/**
 * Props:
 * - open: boolean
 * - label?: string
 * - subtitle?: string
 */
export default function LoadingOverlay({ open, label = "Loading…", subtitle }) {
  if (!open) return null;

  const ariaLabel = subtitle ? `${label} ${subtitle}` : label;

  return (
    <div className="loading-overlay" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="loading-overlay__backdrop" />
      <div className="loading-overlay__panel" role="status" aria-live="polite">
        <div className="loading-overlay__spinner" aria-hidden="true" />
        <div className="loading-overlay__copy">
          <div className="loading-overlay__text">{label}</div>
          {subtitle ? <div className="loading-overlay__subtext">{subtitle}</div> : null}
        </div>
      </div>
    </div>
  );
}
