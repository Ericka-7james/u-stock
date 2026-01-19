// frontend/src/components/dashboard/cards/MarketLeadersCard.jsx
import { useMemo, useState } from "react";
import "../../../css/dashboard/cards/MarketLeadersCard.css";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function fmtMoney(v) {
  const x = Number(v);
  return Number.isFinite(x) ? `$${x.toFixed(2)}` : "—";
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

// STRICT: only A–Z tickers
function isAlphaOnly(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
}

// If prevClose missing but we have last + pct move,
// back-calc prev ≈ last / (1 + pct/100)
function computePrevFallback(last, pct) {
  const L = n(last);
  const P = n(pct);
  if (L === null || P === null) return null;
  const denom = 1 + P / 100;
  if (!Number.isFinite(denom) || denom <= 0) return null;
  const prev = L / denom;
  if (!Number.isFinite(prev) || prev <= 0) return null;
  return prev;
}

export default function MarketLeadersCard({
  title = "Market leaders",
  subtitle = "Top movers from Alpaca (today). Click one to load the chart.",
  items = [],
  meta = null,
  loading = false,
  onSelectSymbol,
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  // show 4 in-card; modal shows up to 7
  const CARD_MAX = 4;
  const MODAL_MAX = 7;

  const raw = Array.isArray(items) ? items : [];
  const list = raw
    .map((r) => ({
      ...r,
      symbol: String(r?.symbol || "").toUpperCase().trim(),
    }))
    .filter((r) => isAlphaOnly(r.symbol));

  const { rows, anyComputed } = useMemo(() => {
    let computed = false;

    const out = list.map((r) => {
      const sym = r.symbol;
      const pctMove = r?.score ?? r?.changePct;

      const last = n(r?.last);

      let prev = n(r?.prevClose);
      if (prev !== null && prev <= 0) prev = null;

      const backendComputed = Boolean(r?.prevCloseComputed);

      let computedHere = false;
      if (prev === null) {
        const fb = computePrevFallback(last, pctMove);
        if (fb !== null) {
          prev = fb;
          computedHere = true;
        }
      }

      if (backendComputed || computedHere) computed = true;

      return {
        sym,
        pctMove,
        last,
        prev,
      };
    });

    return { rows: out, anyComputed: computed };
  }, [list]);

  const sourceLabel =
    meta?.source_label ||
    meta?.sourceLabel ||
    (anyComputed ? "ALPACA+Computed" : meta?.source?.label || meta?.source || "ALPACA");

  const cardRows = rows.slice(0, CARD_MAX);
  const modalRows = rows.slice(0, MODAL_MAX);
  const hasMore = rows.length > CARD_MAX;

  function handlePick(sym) {
    onSelectSymbol?.(sym);
    setMoreOpen(false);
  }

  function closeModal() {
    setMoreOpen(false);
  }

  return (
    <section className="mlCard">
      <div className="mlHeader">
        <div className="mlTitle">{title}</div>
        {subtitle ? <div className="mlSubtitle">{subtitle}</div> : null}
      </div>

      <div className="mlTableHead">
        <div>Symbol</div>
        <div className="right">Move</div>
      </div>

      <div className="mlBody">
        {loading ? (
          Array.from({ length: CARD_MAX }).map((_, i) => <div key={i} className="mlRow mlRowSkeleton" />)
        ) : cardRows.length ? (
          cardRows.map((r, i) => {
            const scoreTone = toneForScore(r.pctMove);
            const showSecondLine = r.last !== null || r.prev !== null;

            return (
              <button
                key={`${r.sym}-${i}`}
                type="button"
                className="mlRow"
                onClick={() => handlePick(r.sym)}
                title={r.sym}
              >
                <div className="mlRowTop">
                  <div className="mlSymbol" title={r.sym}>
                    {r.sym}
                  </div>

                  <div className={`mlScore ${scoreTone}`}>
                    {fmtPct(r.pctMove)}
                    {n(r.pctMove) !== null ? (
                      <span className="mlArrow">{n(r.pctMove) >= 0 ? "↑" : "↓"}</span>
                    ) : null}
                  </div>
                </div>

                {showSecondLine ? (
                  <div className="mlRowSub">
                    <span>Last price: {r.last === null ? "—" : `${fmtMoney(r.last)} (USD/share)`}</span>
                    <span className="dot">·</span>
                    <span>Prev close: {r.prev === null ? "—" : `${fmtMoney(r.prev)} (USD/share)`}</span>
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

        {!loading && hasMore ? (
          <div className="mlMoreRow">
            <button type="button" className="mlMoreBtn" onClick={() => setMoreOpen(true)} title="View more leaders">
              View more
            </button>
          </div>
        ) : null}
      </div>

      <div className="mlFoot">
        Source: {sourceLabel}
        {meta?.asOf ? <span className="mlFootSep"> · </span> : null}
        {meta?.asOf ? <span>As of {new Date(meta.asOf * 1000).toLocaleTimeString()}</span> : null}
      </div>

      {/* Modal */}
      {moreOpen ? (
        <div className="mlModalBackdrop" onClick={closeModal}>
          <div className="mlModal" onClick={(e) => e.stopPropagation()}>
            <div className="mlModalHeader">
              <div>
                <div className="mlModalTitle">More market leaders</div>
                <div className="mlModalSub">Showing up to {MODAL_MAX}. Click one to load the chart.</div>
              </div>

              <button type="button" className="mlModalClose" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className="mlTableHead mlModalHead">
              <div>Symbol</div>
              <div className="right">Move</div>
            </div>

            <div className="mlBody mlModalBody">
              {modalRows.length ? (
                modalRows.map((r, i) => {
                  const scoreTone = toneForScore(r.pctMove);
                  const showSecondLine = r.last !== null || r.prev !== null;

                  return (
                    <button
                      key={`modal-${r.sym}-${i}`}
                      type="button"
                      className="mlRow"
                      onClick={() => handlePick(r.sym)}
                      title={r.sym}
                    >
                      <div className="mlRowTop">
                        <div className="mlSymbol" title={r.sym}>
                          {r.sym}
                        </div>

                        <div className={`mlScore ${scoreTone}`}>
                          {fmtPct(r.pctMove)}
                          {n(r.pctMove) !== null ? (
                            <span className="mlArrow">{n(r.pctMove) >= 0 ? "↑" : "↓"}</span>
                          ) : null}
                        </div>
                      </div>

                      {showSecondLine ? (
                        <div className="mlRowSub">
                          <span>Last price: {r.last === null ? "—" : `${fmtMoney(r.last)} (USD/share)`}</span>
                          <span className="dot">·</span>
                          <span>Prev close: {r.prev === null ? "—" : `${fmtMoney(r.prev)} (USD/share)`}</span>
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

            <div className="mlModalFoot">Source: {sourceLabel}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
