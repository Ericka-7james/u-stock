// frontend/src/components/dashboard/WelcomeConnectModal.jsx
import React, { useMemo } from "react";
import Modal from "../common/Modal.jsx";
import "../../css/dashboard/WelcomeConnectModal.css";

export default function WelcomeConnectModal({ open, onClose, onConnect, welcomeImage }) {
  const footer = useMemo(() => {
    return (
      <div className="welcome-modal-footer">
        <button className="welcome-modal-btn welcome-modal-btn--ghost" type="button" onClick={onClose}>
          Not now
        </button>

        <button className="welcome-modal-btn welcome-modal-btn--primary" type="button" onClick={onConnect}>
          Connect a bot
        </button>
      </div>
    );
  }, [onClose, onConnect]);

  return (
    <Modal open={open} title="Welcome to U-Stock" onClose={onClose} footer={footer}>
      <div className="welcome-modal">
        {welcomeImage ? (
          <div className="welcome-modal-hero" aria-hidden="true">
            <img
              className="welcome-modal-img"
              src={welcomeImage}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
        ) : null}

        <div className="welcome-modal-block">
          <div className="welcome-modal-pill">Get started</div>
          <div className="welcome-modal-text">
            Your dashboard gets way more useful once a bot runner is connected.
            Head to <strong>Bots</strong> to connect (paper trading recommended first).
          </div>
        </div>

        <div className="welcome-modal-block">
          <div className="welcome-modal-pill">Quick steps</div>
          <ol className="welcome-modal-steps">
            <li>
              Open <strong>Bots</strong>.
            </li>
            <li>
              Click <strong>Connect</strong> and follow the prompts.
            </li>
            <li>Come back here to see signals and opportunities.</li>
          </ol>
        </div>

        <div className="welcome-modal-note">You can always connect later from the sidebar.</div>
      </div>
    </Modal>
  );
}