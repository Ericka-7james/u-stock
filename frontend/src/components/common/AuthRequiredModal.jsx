// src/components/common/AuthRequiredModal.jsx
import "../../css/common/AuthRequiredModal.css";
import errorSquirrel from "../../assets/images/ErrorSquirrel.png";

export default function AuthRequiredModal({
  open,
  title = "Uh oh!",
  message = "You need to sign in to continue.",
  onClose,
  onPrimary,
  primaryLabel = "Sign in",
  secondaryLabel = "Cancel",
}) {
  if (!open) return null;

  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="auth-modal-x" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <div className="auth-modal-head">
          <img className="auth-modal-img" src={errorSquirrel} alt="" aria-hidden="true" />
        </div>

        <div className="auth-modal-body">
          <div className="auth-modal-title">{title}</div>
          <div className="auth-modal-msg">{message}</div>
        </div>

        <div className="auth-modal-actions">
          <button type="button" className="auth-modal-btn auth-modal-btn--primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button type="button" className="auth-modal-btn auth-modal-btn--ghost" onClick={onClose}>
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
