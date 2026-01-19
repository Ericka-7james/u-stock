// frontend/src/components/dashboard/cards/OpportunitiesCard.jsx
import "../../../css/dashboard/cards/CardShared.css";

export default function OpportunitiesCard({
  title = "Opportunities",
  subtitle = "Bot-ranked picks (requires a bot running).",
  data = null,
  loading = false,
  onSelectSymbol,
}) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const requiresBotRunning = Boolean(data?.requiresBotRunning);

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h3 className="panelTitle">{title}</h3>
          <p className="panelSubtitle">{subtitle}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Loading…</div>
      ) : null}

      {!loading && requiresBotRunning ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          {data?.message || "Start a bot to generate opportunities."}
        </div>
      ) : null}

      {!loading && !requiresBotRunning && items.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          No opportunities returned yet.
        </div>
      ) : null}

      {items.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {items.map((it, idx) => {
            const sym = String(it?.symbol || "").toUpperCase();
            const score = it?.score ?? it?.edge ?? null;

            return (
              <button
                key={`${sym}-${idx}`}
                type="button"
                onClick={() => onSelectSymbol?.(sym)}
                style={{
                  textAlign: "left",
                  border: "1px solid rgba(148,163,184,0.25)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "transparent",
                  cursor: "pointer",
                }}
                title="Click to load this symbol"
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>{sym || "—"}</div>
                  <div style={{ fontWeight: 800, opacity: 0.85 }}>
                    {score !== null ? `Score: ${score}` : ""}
                  </div>
                </div>

                {it?.reason ? (
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                    {String(it.reason)}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
