// src/components/common/TermsModal.jsx
import Modal from "./Modal";

export default function TermsModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      title="Terms & usage"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="connected-btn connected-btn--primary"
          onClick={onClose}
        >
          Got it
        </button>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0 }}>
          Lucent Financial is a personal financial tooling dashboard. It may display signals,
          insights, or strategy outputs, but it does not guarantee results.
        </p>

        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Important</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Not financial advice.</li>
            <li>Trading involves risk and you can lose money.</li>
            <li>Paper trading is recommended while testing strategies.</li>
          </ul>
        </div>

        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Connections</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>API keys are stored server-side (never in the browser).</li>
            <li>You can disconnect providers at any time.</li>
            <li>Nothing trades unless you explicitly enable a strategy.</li>
          </ul>
        </div>

        <p style={{ margin: 0, opacity: 0.8, fontSize: 13 }}>
          This text is meant to be clear and user-friendly, not legal language. If you later want a
          full “Terms of Service” page, we can add a dedicated route.
        </p>
      </div>
    </Modal>
  );
}
