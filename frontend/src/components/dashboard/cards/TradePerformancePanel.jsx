// frontend/src/components/dashboard/cards/TradePerformancePanel.jsx
import { useMemo } from "react";
import "../../../css/dashboard/cards/TradePerformancePanel.css";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function fmtMoney(v) {
  const x = n(v);
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}
function fmtPct(v) {
  return `${Math.round(n(v))}%`;
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

function TableCard({ title, rows, tone }) {
  return (
    <CardShell title={title} className="tpTableCard">
      <div className="tpTableHead">
        <div>Ticker</div>
        <div className="right">P/L</div>
      </div>

      <div className="tpTableBody">
        {rows?.length ? (
          rows.slice(0, 6).map((r, i) => (
            <div key={i} className={`tpRow ${tone}`}>
              <div className="mono">{String(r.symbol || "").toUpperCase()}</div>
              <div className="right mono">{fmtMoney(r.pnl)}</div>
            </div>
          ))
        ) : (
          <div className="tpEmpty">No trades in this range.</div>
        )}
      </div>
    </CardShell>
  );
}

function OpportunityTable({ title, rows }) {
  return (
    <div className="tpOppMiniTable">
      <div className="tpOppMiniTitle">{title}</div>

      <div className="tpOppHead">
        <div>Symbol</div>
        <div className="right">Score</div>
      </div>

      <div className="tpOppBody">
        {rows?.length ? (
          rows.slice(0, 6).map((r, i) => (
            <div key={i} className="tpOppRow">
              <div className="mono">{String(r.symbol || "").toUpperCase()}</div>
              <div className="right mono">{Number(r.score || 0).toFixed(2)}</div>
            </div>
          ))
        ) : (
          <div className="tpEmpty">
            Not wired yet. Phase 1 will rank symbols using expected move − costs.
          </div>
        )}
      </div>

      {/* tiny note for transparency */}
      <div className="tpOppFootnote">
        Score = expectedMove% × (1 + momentum) − cost%
      </div>
    </div>
  );
}

/**
 * TradePerformancePanel
 * - data: { start, end, trades: [{symbol,pnl,...}] }
 * - onChangeRange: (preset) => void
 *
 * Optional (future): opportunities = { crypto:[], stocks:[], funds:[] }
 */
export default function TradePerformancePanel({ data, onChangeRange, opportunities = null }) {
  const safe = data || { start: "", end: "", trades: [] };
  const trades = Array.isArray(safe.trades) ? safe.trades : [];

  const summary = useMemo(() => {
    const total = trades.reduce((a, t) => a + n(t.pnl), 0);
    const wins = trades.filter((t) => n(t.pnl) > 0);
    const losses = trades.filter((t) => n(t.pnl) < 0);

    const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;

    const maxWin = wins.length ? Math.max(...wins.map((t) => n(t.pnl))) : 0;
    const maxLoss = losses.length ? Math.min(...losses.map((t) => n(t.pnl))) : 0;

    const avgWin = wins.length
      ? wins.reduce((a, t) => a + n(t.pnl), 0) / wins.length
      : 0;

    const avgLoss = losses.length
      ? Math.abs(losses.reduce((a, t) => a + n(t.pnl), 0) / losses.length)
      : 0;

    const grossProfit = wins.reduce((a, t) => a + n(t.pnl), 0);
    const grossLossAbs = Math.abs(losses.reduce((a, t) => a + n(t.pnl), 0));
    const profitFactor =
      grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? 99 : 0;

    const topWins = [...wins].sort((a, b) => n(b.pnl) - n(a.pnl));
    const topLosses = [...losses].sort((a, b) => n(a.pnl) - n(b.pnl));

    const expectancy = trades.length ? total / trades.length : 0;

    return {
      total,
      tradesCount: trades.length,
      winsCount: wins.length,
      lossesCount: losses.length,
      winRate,
      maxWin,
      maxLoss,
      avgWin,
      avgLoss,
      profitFactor,
      expectancy,
      profitPerTrade: trades.length ? total / trades.length : 0,
      topWins,
      topLosses,
    };
  }, [trades]);

  const totalTone = summary.total >= 0 ? "pos" : "neg";

  const oppCrypto = opportunities?.crypto || [];
  const oppStocks = opportunities?.stocks || [];
  const oppFunds = opportunities?.funds || [];

  return (
    <section className="tpPanel">
      {/* Header styled like PriceChartPanel header */}
      <div className="tpHeaderBar">
        <div className="tpHeaderLeft">
          <div className="tpTitleRow">
            <h2 className="tpTitleText">Trade Performance</h2>
          </div>
          <p className="tpSubtitle">
            {safe.start} — {safe.end}
          </p>
        </div>

        <div className="tpTabs">
          {["Week", "Month", "Year"].map((p) => (
            <button
              key={p}
              className="tpTab"
              type="button"
              onClick={() => onChangeRange?.(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Card grid (independent surfaces) */}
      <div className="tpLeft">
        <div className="tpLeftGrid">
          <BigStat
            label="Win Ratio"
            value={fmtPct(summary.winRate)}
            sub={`${summary.tradesCount} trades`}
          />

          <BigStat
            label="Total Profit"
            value={fmtMoney(summary.total)}
            sub={`Expectancy ${fmtMoney(summary.expectancy)}`}
            tone={totalTone}
          />

          <div className="tpMiniGrid">
            <MiniStat label="Trades" value={String(summary.tradesCount)} />
            <MiniStat label="Wins" value={String(summary.winsCount)} tone="pos" />
            <MiniStat label="Losses" value={String(summary.lossesCount)} tone="neg" />
            <MiniStat label="Profit/Trade" value={fmtMoney(summary.profitPerTrade)} />
            <MiniStat label="Max Loss" value={fmtMoney(summary.maxLoss)} tone="neg" />
            <MiniStat label="Max Win" value={fmtMoney(summary.maxWin)} tone="pos" />
          </div>

          <CardShell title="Exit Reason" className="tpSpan2">
            <div className="tpEmpty">
              Phase 1: classify from trade logs (stop, target, time, manual, reversal).
            </div>
          </CardShell>

          <CardShell title="Avg Win / Loss" className="tpSpan2">
            <div className="tpEmpty">
              Phase 1: show distribution + variance (histogram / box stats), not just averages.
            </div>
            <div className="tpTinyStats">
              <div className="tpTinyRow">
                <div className="muted">Avg Win</div>
                <div className="mono">{fmtMoney(summary.avgWin)}</div>
              </div>
              <div className="tpTinyRow">
                <div className="muted">Avg Loss</div>
                <div className="mono">-{fmtMoney(summary.avgLoss).replace("-", "")}</div>
              </div>
              <div className="tpTinyRow">
                <div className="muted">Profit Factor</div>
                <div className="mono">{summary.profitFactor.toFixed(2)}</div>
              </div>
            </div>
          </CardShell>

          <div className="tpSpan2 tpTables">
            <TableCard title="Top Wins" rows={summary.topWins} tone="pos" />
            <TableCard title="Top Losses" rows={summary.topLosses} tone="neg" />
          </div>

          {/* ✅ NEW: bottom card for day-trading opportunities */}
          <CardShell title="Top Day Trades (Opportunity)" className="tpSpan2">
            <div className="tpOppGrid">
              <OpportunityTable title="Crypto" rows={oppCrypto} />
              <OpportunityTable title="Stocks" rows={oppStocks} />
              <OpportunityTable title="ETFs / Funds" rows={oppFunds} />
            </div>
          </CardShell>
        </div>
      </div>
    </section>
  );
}
