// frontend/src/components/dashboard/cards/OpportunitiesCard.jsx
import "../../../css/dashboard/cards/CardShared.css";
import { OPPORTUNITIES_CARD_COPY as COPY } from "../../../content/dashboard/cards/opportunitiesCard.content.ts";

export default function OpportunitiesCard({
  title = COPY.title,
  subtitle = COPY.subtitle,
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
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>{COPY.states.loading}</div>
      ) : null}

      {!loading && requiresBotRunning ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          {data?.message || COPY.states.requiresBotFallback}
        </div>
      ) : null}

      {!loading && !requiresBotRunning && items.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>{COPY.states.empty}</div>
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
                title={COPY.row.clickTitle}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>{sym || COPY.row.symbolFallback}</div>
                  <div style={{ fontWeight: 800, opacity: 0.85 }}>
                    {score !== null ? `${COPY.row.scorePrefix} ${score}` : ""}
                  </div>
                </div>

                {it?.reason ? (
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{String(it.reason)}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}