import "../../css/common/FullPageLoader.css";

export default function FullPageLoader({ label = "Loading…" }) {
  return (
    <div className="fpl-wrap" role="status" aria-live="polite" aria-label={label}>
      <div className="fpl-card">
        <div className="fpl-spinner" />
        <div className="fpl-text">{label}</div>
      </div>
    </div>
  );
}
