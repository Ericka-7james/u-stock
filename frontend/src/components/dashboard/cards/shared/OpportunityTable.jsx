// frontend/src/components/dashboard/cards/shared/OpportunityTable.jsx

function isAlphaOnlySymbol(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
}

function PillRow({ symbol, score, sub = "", onClick }) {
  const sym = String(symbol || "").toUpperCase();
  const scoreStr = Number.isFinite(Number(score)) ? Number(score).toFixed(2) : "—";
  const tooltip = [sym, `Score: ${scoreStr}`, sub].filter(Boolean).join("\n");

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid rgba(148,163,184,0.25)",
        background: "transparent",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        cursor: onClick ? "pointer" : "default",
        color: "inherit",
        overflow: "hidden",
        textAlign: "left",
      }}
    >
      <div
        className="mono"
        style={{
          fontWeight: 900,
          fontSize: 14,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          width: "100%",
        }}
      >
        {sym}
      </div>

      <div className="mono" style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap" }}>
        Score {scoreStr}
      </div>
    </button>
  );
}

export default function OpportunityTable({ title, rows, emptyMessage, onPickSymbol, sourceLabel }) {
  const clean = Array.isArray(rows) ? rows : [];

  return (
    <div className="tpOppMiniTable" style={{ overflow: "hidden", borderRadius: 14 }}>
      <div
        className="tpOppMiniTitle"
        style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}
      >
        <span>{title}</span>
        {sourceLabel ? (
          <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" }}>Source: {sourceLabel}</span>
        ) : null}
      </div>

      <div className="tpOppHead">
        <div>Symbol</div>
        <div className="right">Score</div>
      </div>

      <div className="tpOppBody" style={{ display: "grid", gap: 10 }}>
        {clean.length ? (
          clean.slice(0, 6).map((r, i) => {
            const sym = String(r.symbol || "").toUpperCase();
            const sub = r.sub ? String(r.sub) : "";
            if (!isAlphaOnlySymbol(sym)) return null;

            return (
              <PillRow
                key={`${sym}-${i}`}
                symbol={sym}
                score={r.score}
                sub={sub}
                onClick={
                  onPickSymbol
                    ? () => {
                        if (!isAlphaOnlySymbol(sym)) return;
                        onPickSymbol(sym);
                      }
                    : undefined
                }
              />
            );
          })
        ) : (
          <div className="tpEmpty">{emptyMessage || "No results yet."}</div>
        )}
      </div>
    </div>
  );
}