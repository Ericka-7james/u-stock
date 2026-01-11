import "../../../css/dashboard/cards/MarketLeadersCard.css";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function nullIfZero(x) {
  const v = n(x);
  if (v === null) return null;
  if (v === 0) return null; // IMPORTANT: backend used 0 as placeholder before; treat as missing
  return v;
}

function fmt2(x) {
  const v = n(x);
  if (v === null) return "—";
  return v.toFixed(2);
}

function fmtPct(x) {
  const v = n(x);
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function toneForScore(score) {
  const v = n(score);
  if (v === null) return "";
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "";
}

export default function MarketLeadersCard({
  title = "Market leaders (today)",
  subtitle = "Top movers from Alpaca (today). Click one to load the chart.",
  items = [],
  meta = null,
  loading = false,
  onSelectSymbol,
}) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section className="mlCard">
      <div className="mlHeader">
        <div className="mlTitle">{title}</div>
        {subtitle ? <div className="mlSubtitle">{subtitle}</div> : null}
      </div>

      <div className="mlTableHead">
        <div>Symbol</div>
        <div className="right">Score</div>
      </div>

      <div className="mlBody">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <div key={i} className="mlRow mlRowSkeleton" />)
        ) : list.length ? (
          list.map((r, i) => {
            const sym = String(r?.symbol || "").toUpperCase();

            // ✅ score can come from computed "score" or movers "changePct"
            const score = r?.score ?? r?.changePct;

            const last = n(r?.last);
            const prev = nullIfZero(r?.prevClose);

            const scoreTone = toneForScore(score);
            const showSecondLine = last !== null || prev !== null;

            return (
              <button
                key={`${sym}-${i}`}
                type="button"
                className="mlRow"
                onClick={() => onSelectSymbol?.(sym)}
                title={sym}
              >
                <div className="mlRowTop">
                  <div className="mlSymbol" title={sym}>
                    {sym}
                  </div>

                  <div className={`mlScore ${scoreTone}`}>
                    {fmtPct(score)}
                    {n(score) !== null ? (
                      <span className="mlArrow">{n(score) >= 0 ? "↑" : "↓"}</span>
                    ) : null}
                  </div>
                </div>

                {showSecondLine ? (
                  <div className="mlRowSub">
                    <span>Last: {last === null ? "—" : fmt2(last)}</span>
                    <span className="dot">·</span>
                    <span>Prev close: {prev === null ? "—" : fmt2(prev)}</span>
                  </div>
                ) : (
                  <div className="mlRowSub muted">—</div>
                )}
              </button>
            );
          })
        ) : (
          <div className="mlEmpty">No leaders returned yet.</div>
        )}
      </div>

      <div className="mlFoot">
        Source: {meta?.source?.label || "ALPACA"}
        {meta?.asOf ? (
          <span className="mlFootSep"> · </span>
        ) : null}
        {meta?.asOf ? (
          <span>As of {new Date(meta.asOf * 1000).toLocaleTimeString()}</span>
        ) : null}
      </div>
    </section>
  );
}
