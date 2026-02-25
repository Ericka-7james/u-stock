// frontend/src/components/dashboard/cards/MarketLeadersCard.jsx
import { useMemo, useState } from "react";
import Modal from "../../common/Modal.jsx";
import "../../../css/dashboard/cards/MarketLeadersCard.css";

import {
  nOrNull,
  fmtMoney,
  fmtPctSigned,
  toneForScore,
  isAlphaOnlySymbol,
  computePrevFallback,
} from "../../../lib/format/marketFormat.js";

export default function MarketLeadersCard({
  title = "Market leaders",
  subtitle = "Top movers from Alpaca (today). Click one to load the chart.",
  items = [],
  meta = null,
  loading = false,
  onSelectSymbol,
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  const CARD_MAX = 4;
  const MODAL_MAX = 7;

  const list = useMemo(() => {
    const raw = Array.isArray(items) ? items : [];
    return raw
      .map((r) => ({
        ...r,
        symbol: String(r?.symbol || "").toUpperCase().trim(),
      }))
      .filter((r) => isAlphaOnlySymbol(r.symbol));
  }, [items]);

  const { rows, anyComputed } = useMemo(() => {
    let computed = false;

    const out = list.map((r) => {
      const sym = r.symbol;

      const pctMove = nOrNull(r?.score ?? r?.changePct);
      const last = nOrNull(r?.last);

      let prev = nOrNull(r?.prevClose);
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

      return { sym, pctMove, last, prev };
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

  const modalFooter = <div className="mlModalFoot">Source: {sourceLabel}</div>;

  return (
    <section className="panel mlCard">
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
            const hasPct = r.pctMove !== null;

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
                    {fmtPctSigned(r.pctMove)}
                    {hasPct ? <span className="mlArrow">{r.pctMove >= 0 ? "↑" : "↓"}</span> : null}
                  </div>
                </div>

                {showSecondLine ? (
                  <div className="mlRowSub">
                    <span className="mlLast">
                      Last price: {r.last === null ? "—" : `${fmtMoney(r.last)} (USD/share)`}
                    </span>
                    <span className="mlPrev">
                      Prev close: {r.prev === null ? "—" : `${fmtMoney(r.prev)} (USD/share)`}
                    </span>
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

      {/* ✅ Use shared Modal so mobile centering matches Feedback/etc */}
      <Modal open={moreOpen} title="More market leaders" onClose={() => setMoreOpen(false)} footer={modalFooter}>
        <div className="mlModalSub">Showing up to {MODAL_MAX}. Click one to load the chart.</div>

        <div className="mlTableHead mlModalHead">
          <div>Symbol</div>
          <div className="right">Move</div>
        </div>

        <div className="mlBody mlModalBody">
          {modalRows.length ? (
            modalRows.map((r, i) => {
              const scoreTone = toneForScore(r.pctMove);
              const showSecondLine = r.last !== null || r.prev !== null;
              const hasPct = r.pctMove !== null;

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
                      {fmtPctSigned(r.pctMove)}
                      {hasPct ? <span className="mlArrow">{r.pctMove >= 0 ? "↑" : "↓"}</span> : null}
                    </div>
                  </div>

                  {showSecondLine ? (
                    <div className="mlRowSub">
                      <span className="mlLast">
                        Last price: {r.last === null ? "—" : `${fmtMoney(r.last)} (USD/share)`}
                      </span>
                      <span className="mlPrev">
                        Prev close: {r.prev === null ? "—" : `${fmtMoney(r.prev)} (USD/share)`}
                      </span>
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
      </Modal>
    </section>
  );
}