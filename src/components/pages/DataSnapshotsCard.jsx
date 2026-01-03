// src/components/dashboard/cards/DataSnapshotsCard.jsx
import "../../css/dashboard/cards/CardShared.css";

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function DataSnapshotsCard({ signalsMeta, pricesMeta, priceSymbols = [], health }) {
  const status = health?.status || "unknown";
  const mode = health?.mode || "—";
  const lastSuccess = health?.last_success_at_utc;
  const lastAttempt = health?.last_attempt_at_utc;
  const durationMs = health?.duration_ms;
  const err = health?.error;

  return (
    <div className="card card-shared">
      <div className="card-title">Data Snapshots</div>

      <div className="card-row">
        <span className="card-label">Pipeline status</span>
        <span className="card-value">{status}</span>
      </div>

      <div className="card-row">
        <span className="card-label">Mode</span>
        <span className="card-value">{mode}</span>
      </div>

      <div className="card-row">
        <span className="card-label">Last success</span>
        <span className="card-value">{fmt(lastSuccess)}</span>
      </div>

      <div className="card-row">
        <span className="card-label">Last attempt</span>
        <span className="card-value">{fmt(lastAttempt)}</span>
      </div>

      <div className="card-row">
        <span className="card-label">Duration</span>
        <span className="card-value">{durationMs ? `${Math.round(durationMs / 1000)}s` : "—"}</span>
      </div>

      {status !== "success" && err && (
        <div className="card-error" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600 }}>Last error</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{err}</div>
        </div>
      )}
    </div>
  );
}
