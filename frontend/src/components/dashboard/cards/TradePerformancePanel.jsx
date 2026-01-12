// frontend/src/components/dashboard/cards/TradePerformancePanel.jsx
import { useMemo } from "react";
import "../../../css/dashboard/cards/TradePerformancePanel.css";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function fmtPct(v) {
  return `${Math.round(n(v))}%`;
}
function fmtPrice(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

// ✅ STRICT: no dots, numbers, dashes, slashes, spaces — ONLY A–Z
function isAlphaOnlySymbol(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
}

function CardShell({ title, children, className = "" }) {
  return (
    <div className={`tpCard ${className}`}>
      {title ? <div className="tpCardTitle">{title}</div> : null}
      {children}
    </div>
  );
}

function BigStat({ label, value, sub, tone = "" }) {
  return (
    <CardShell title={label} className={`tpBigCard ${tone}`}>
      <div className="tpBigValue">{value}</div>
      {sub ? <div className="tpBigSub">{sub}</div> : null}
    </CardShell>
  );
}

function MiniStat({ label, value, tone = "" }) {
  return (
    <div className={`tpMiniCard ${tone}`}>
      <div className="tpMiniLabel">{label}</div>
      <div className="tpMiniValue">{value}</div>
    </div>
  );
}

/**
 * PillRow rules:
 * - Always show full SYMBOL
 * - Tooltip on hover shows full symbol + full score + sub line.
 */
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
      {/* TOP: SYMBOL ONLY */}
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

      {/* BOTTOM: SCORE */}
      <div className="mono" style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap" }}>
        Score {scoreStr}
      </div>
    </button>
  );
}

function OpportunityTable({ title, rows, emptyMessage, onPickSymbol }) {
  const clean = Array.isArray(rows) ? rows : [];

  return (
    <div className="tpOppMiniTable" style={{ overflow: "hidden", borderRadius: 14 }}>
      <div className="tpOppMiniTitle">{title}</div>

      <div className="tpOppHead">
        <div>Symbol</div>
        <div className="right">Score</div>
      </div>

      <div className="tpOppBody" style={{ display: "grid", gap: 10 }}>
        {clean.length ? (
          clean.slice(0, 6).map((r, i) => {
            const sym = String(r.symbol || "").toUpperCase();
            const sub = r.sub ? String(r.sub) : "";

            // ✅ Safety check for display + clicks
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

export default function TradePerformancePanel({
  data,
  onChangeRange,
  opportunities = null,
  leaders = [],
  activeBot = null,
  onPickSymbol,
}) {
  // ✅ Filter bot picks too
  const oppStocks = useMemo(() => {
    const raw = Array.isArray(opportunities?.stocks) ? opportunities.stocks : [];
    return raw
      .map((x) => ({
        ...x,
        symbol: String(x?.symbol || "").toUpperCase().trim(),
      }))
      .filter((x) => x.symbol && isAlphaOnlySymbol(x.symbol));
  }, [opportunities]);

  // ✅ Filter leaders too
  const leadersClean = useMemo(() => {
    const raw = Array.isArray(leaders) ? leaders : [];
    return raw
      .map((x) => ({
        symbol: String(x?.symbol || "").toUpperCase().trim(),
        changePct: n(x?.changePct ?? x?.score), // allow either
        last: x?.last,
        prevClose: x?.prevClose,
      }))
      .filter((x) => x.symbol && isAlphaOnlySymbol(x.symbol));
  }, [leaders]);

  const leadersScored = useMemo(() => {
    return [...leadersClean]
      .map((l) => ({
        symbol: l.symbol,
        score: Math.abs(l.changePct),
        sub: `Last ${fmtPrice(l.last)} · Prev ${fmtPrice(l.prevClose)}`,
      }))
      .sort((a, b) => n(b.score) - n(a.score))
      .slice(0, 6);
  }, [leadersClean]);

  const aligned = useMemo(() => {
    const oppSet = new Map(oppStocks.map((x) => [String(x.symbol || "").toUpperCase(), x]));
    const out = [];

    for (const l of leadersClean) {
      const hit = oppSet.get(l.symbol);
      if (hit) {
        const botScore = n(hit.score);
        const moveScore = Math.abs(l.changePct);
        out.push({
          symbol: l.symbol,
          score: botScore + moveScore,
          sub: `Bot ${botScore.toFixed(2)} + Move ${moveScore.toFixed(2)}%`,
        });
      }
    }

    out.sort((a, b) => n(b.score) - n(a.score));
    return out.slice(0, 6);
  }, [leadersClean, oppStocks]);

  const botRunning = Boolean(activeBot?.running);
  const botName = String(activeBot?.name || "").trim();

  const safe = data || { start: "", end: "", trades: [] };
  const trades = Array.isArray(safe.trades) ? safe.trades : [];
  const winRate = trades.length ? (trades.filter((t) => n(t.pnl) > 0).length / trades.length) * 100 : 0;

  return (
    <section className="tpPanel">
      <div className="tpHeaderBar">
        <div className="tpHeaderLeft">
          <div className="tpTitleRow">
            <h2 className="tpTitleText">Opportunities</h2>
          </div>

          <p className="tpSubtitle">
            {botRunning ? `Bot running: ${botName || "Unknown bot"}` : "No bot running — start a bot to unlock bot-aligned picks."}
          </p>
        </div>

        <div className="tpTabs">
          {["Week", "Month", "Year"].map((p) => (
            <button key={p} className="tpTab" type="button" onClick={() => onChangeRange?.(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="tpLeft">
        <div className="tpLeftGrid">
          <BigStat
            label="Bot Status"
            value={botRunning ? "LIVE" : "OFF"}
            sub={botRunning ? "Using bot alignment" : "Leaders-only (Phase 1)"}
            tone={botRunning ? "pos" : "neg"}
          />

          <BigStat label="Trades Context" value={`${trades.length}`} sub={`Win rate ${fmtPct(winRate)}`} />

          <div className="tpMiniGrid">
            <MiniStat label="Leaders" value={String(leadersClean.length)} />
            <MiniStat label="Aligned" value={String(aligned.length)} tone={aligned.length ? "pos" : ""} />
            <MiniStat label="Internal Picks" value={String(oppStocks.length)} />
          </div>

          <CardShell title="Top Day Trades (Opportunity)" className="tpSpan2">
            <div className="tpOppGrid">
              <OpportunityTable
                title="Bot-aligned (leaders ∩ bot)"
                rows={botRunning ? aligned : []}
                emptyMessage={botRunning ? "No overlap yet." : "Start a bot to generate aligned picks."}
                onPickSymbol={onPickSymbol}
              />

              <OpportunityTable
                title="Market leaders (today)"
                rows={leadersScored}
                emptyMessage="No leaders returned yet."
                onPickSymbol={onPickSymbol}
              />

              <OpportunityTable
                title="Internal (bot picks)"
                rows={(oppStocks || []).slice(0, 6).map((r) => ({
                  symbol: r.symbol,
                  score: r.score,
                  sub: r.reason ? String(r.reason) : "",
                }))}
                emptyMessage="Bot opportunities not wired yet."
                onPickSymbol={onPickSymbol}
              />
            </div>

            <div className="tpOppFootnote">Phase 1 scoring = overlap boost + |today move|. Hover any pill to see full details.</div>
          </CardShell>
        </div>
      </div>
    </section>
  );
}
