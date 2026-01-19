// frontend/src/components/dashboard/cards/TradePerformancePanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import BotControlCard from "./BotControlCard.jsx";
import "../../../css/dashboard/cards/TradePerformancePanel.css";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function nn(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}
function fmtPct(v) {
  return `${Math.round(n(v))}%`;
}
function fmtMoney(v) {
  const x = Number(v);
  return Number.isFinite(x) ? `$${x.toFixed(2)}` : "—";
}

// ✅ STRICT: no dots, numbers, dashes — ONLY A–Z
function isAlphaOnlySymbol(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
}

// If prevClose missing but we have last + pct move,
// back-calc prev ≈ last / (1 + pct/100)
function computePrevFallback(last, pct) {
  const L = nn(last);
  const P = nn(pct);
  if (L === null || P === null) return null;
  const denom = 1 + P / 100;
  if (!Number.isFinite(denom) || denom <= 0) return null;
  const prev = L / denom;
  if (!Number.isFinite(prev) || prev <= 0) return null;
  return prev;
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

function OpportunityTable({ title, rows, emptyMessage, onPickSymbol, sourceLabel }) {
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

/* -------------------------------------------
   Bot Intents section (visible bot value)
-------------------------------------------- */

function fmtTime(epochSec) {
  const t = Number(epochSec);
  if (!Number.isFinite(t) || t <= 0) return "—";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

function fmtSide(side) {
  const s = String(side || "").trim().toLowerCase();
  if (s === "buy") return "BUY";
  if (s === "sell") return "SELL";
  return (String(side || "—") || "—").toUpperCase();
}

function fmtConf(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

function safeSym(it) {
  return String(it?.symbol || "").trim().toUpperCase();
}

function BotIntentsCard({ botRunning, botId, onPickSymbol }) {
  const [items, setItems] = useState([]);
  const [ts, setTs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const lastBotIdRef = useRef("");

  async function refresh() {
    const id = String(botId || "").trim();
    if (!id) return;

    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`/api/bots/intents?bot_id=${encodeURIComponent(id)}&limit=10`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Failed to load intents");

      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setTs(Number(data?.ts) || 0);
    } catch (e) {
      setErr(String(e?.message || e));
      setItems([]);
      setTs(0);
    } finally {
      setBusy(false);
    }
  }

  // Poll when bot is running/armed (runner alive)
  useEffect(() => {
    const id = String(botId || "").trim();

    if (!botRunning || !id) {
      setItems([]);
      setTs(0);
      setErr("");
      lastBotIdRef.current = id;
      return;
    }

    // If bot changes, clear old intents immediately
    if (lastBotIdRef.current && lastBotIdRef.current !== id) {
      setItems([]);
      setTs(0);
      setErr("");
    }
    lastBotIdRef.current = id;

    refresh();
    const t = setInterval(() => refresh(), 7000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botRunning, botId]);

  return (
    <CardShell title="Bot Intents" className="tpSpan2">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
          {botRunning ? (
            <>
              Showing latest 10 from <span className="mono">{botId || "bot"}</span> · Updated{" "}
              <span className="mono">{ts ? fmtTime(ts) : "—"}</span>
            </>
          ) : (
            "Start a bot to generate intents."
          )}
        </div>

        <button
          className="tpTab"
          type="button"
          onClick={refresh}
          disabled={!botRunning || !botId || busy}
          style={{ height: 34 }}
        >
          Refresh
        </button>
      </div>

      {err ? (
        <div className="tpEmpty" style={{ marginTop: 10 }}>
          Error: {err}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {busy && !items.length ? (
          <div className="tpEmpty">Loading intents…</div>
        ) : items.length ? (
          items.map((it, idx) => {
            const sym = safeSym(it);
            if (!isAlphaOnlySymbol(sym)) return null;

            const side = fmtSide(it?.side);
            const entry = nn(it?.entry);
            const stop = nn(it?.stop);
            const tp = nn(it?.take_profit ?? it?.takeProfit ?? it?.tp);
            const conf = it?.confidence;

            const sub = `Entry ${entry === null ? "—" : fmtMoney(entry)} · Stop ${stop === null ? "—" : fmtMoney(
              stop
            )} · TP ${tp === null ? "—" : fmtMoney(tp)} · Conf ${fmtConf(conf)}`;

            const score = Number.isFinite(Number(conf)) ? Number(conf) : null;

            return (
              <PillRow
                key={`${sym}-${idx}`}
                symbol={`${sym} · ${side}`}
                score={score}
                sub={sub}
                onClick={
                  onPickSymbol
                    ? () => {
                        onPickSymbol(sym);
                      }
                    : undefined
                }
              />
            );
          })
        ) : (
          <div className="tpEmpty">
            {botRunning
              ? "No intents yet. (When market opens and bot logic submits intents, they show here.)"
              : "No bot running."}
          </div>
        )}
      </div>

      <div className="tpOppFootnote" style={{ marginTop: 12 }}>
        Click an intent to load the symbol in the chart. Intents are suggestions, not orders.
      </div>
    </CardShell>
  );
}

export default function TradePerformancePanel({ data, onChangeRange, opportunities = null, leaders = [], onPickSymbol }) {
  // NEW: let BotControlCard drive running state + name
  const [activeBot, setActiveBot] = useState(null);

  const oppStocks = useMemo(() => {
    const raw = Array.isArray(opportunities?.stocks) ? opportunities.stocks : [];
    return raw
      .map((x) => ({
        ...x,
        symbol: String(x?.symbol || "").toUpperCase().trim(),
      }))
      .filter((x) => x.symbol && isAlphaOnlySymbol(x.symbol));
  }, [opportunities]);

  const leadersClean = useMemo(() => {
    const raw = Array.isArray(leaders) ? leaders : [];
    return raw
      .map((x) => ({
        symbol: String(x?.symbol || "").toUpperCase().trim(),
        changePct: n(x?.changePct ?? x?.score),
        last: x?.last,
        prevClose: x?.prevClose,
        prevCloseComputed: Boolean(x?.prevCloseComputed),
      }))
      .filter((x) => x.symbol && isAlphaOnlySymbol(x.symbol));
  }, [leaders]);

  const leadersScored = useMemo(() => {
    let anyComputed = false;

    const rows = [...leadersClean]
      .map((l) => {
        const last = nn(l.last);
        let prev = nn(l.prevClose);
        if (prev !== null && prev <= 0) prev = null;

        let computedHere = false;
        if (prev === null) {
          const fb = computePrevFallback(last, l.changePct);
          if (fb !== null) {
            prev = fb;
            computedHere = true;
          }
        }

        if (l.prevCloseComputed || computedHere) anyComputed = true;

        return {
          symbol: l.symbol,
          score: Math.abs(l.changePct),
          sub: `Last price ${last === null ? "—" : `${fmtMoney(last)} (USD/share)`} · Prev close ${
            prev === null ? "—" : `${fmtMoney(prev)} (USD/share)`
          }`,
        };
      })
      .sort((a, b) => n(b.score) - n(a.score))
      .slice(0, 6);

    return { rows, anyComputed };
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

  // NOTE: BotControlCard should pass {running, bot_id, state/effective_state, pausedReason,...}
  const botStateRaw = String(
    activeBot?.effective_state ?? activeBot?.effectiveState ?? activeBot?.state ?? ""
  )
    .trim()
    .toLowerCase();

  // Treat "waiting_for_market" and "starting" as ARMED/ACTIVE (not OFF)
  const botRunning = Boolean(
    activeBot?.running ||
      botStateRaw === "running" ||
      botStateRaw === "waiting_for_market" ||
      botStateRaw === "starting" ||
      botStateRaw === "paused"
  );

  const botName = String(activeBot?.bot_id || "").trim();

  const safe = data || { start: "", end: "", trades: [] };
  const trades = Array.isArray(safe.trades) ? safe.trades : [];
  const winRate = trades.length ? (trades.filter((t) => n(t.pnl) > 0).length / trades.length) * 100 : 0;

  // Bot Status card label/sub/tone based on effective state
  const botStatusValue =
    botStateRaw === "running"
      ? "LIVE"
      : botStateRaw === "waiting_for_market"
      ? "WAITING"
      : botStateRaw === "starting"
      ? "STARTING"
      : botStateRaw === "paused"
      ? "PAUSED"
      : botRunning
      ? "LIVE"
      : "OFF";

  const botStatusSub =
    botStateRaw === "waiting_for_market"
      ? activeBot?.pausedReason || "Market closed"
      : botStateRaw === "starting"
      ? "Booting up…"
      : botStateRaw === "paused"
      ? activeBot?.pausedReason || "Manually paused"
      : botRunning
      ? "Using bot alignment"
      : "Leaders-only (Phase 1)";

  const botStatusTone =
    botStateRaw === "running" || botStateRaw === "waiting_for_market" || botStateRaw === "starting" ? "pos" : botRunning ? "pos" : "neg";

  return (
    <section className="tpPanel">
      <div className="tpHeaderBar">
        <div className="tpHeaderLeft">
          <div className="tpTitleRow">
            <h2 className="tpTitleText">Opportunities</h2>
          </div>

          <p className="tpSubtitle">
            {botRunning ? `Bot active: ${botName || "Unknown bot"}` : "No bot running — start a bot to unlock bot-aligned picks."}
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
          {/* ✅ IMPORTANT: no CardShell wrapper here (prevents card-in-card) */}
          <div className="tpSpan2">
            <BotControlCard onStateChange={setActiveBot} />
          </div>

          <BigStat
            label="Bot Status"
            value={botStatusValue}
            sub={botStatusSub}
            tone={botStatusTone}
          />

          <BigStat label="Trades Context" value={`${trades.length}`} sub={`Win rate ${fmtPct(winRate)}`} />

          <div className="tpMiniGrid">
            <MiniStat label="Leaders" value={String(leadersClean.length)} />
            <MiniStat label="Aligned" value={String(aligned.length)} tone={aligned.length ? "pos" : ""} />
            <MiniStat label="Internal Picks" value={String(oppStocks.length)} />
          </div>

          {/* ✅ NEW: visible bot value */}
          <BotIntentsCard botRunning={botRunning} botId={botName} onPickSymbol={onPickSymbol} />

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
                rows={leadersScored.rows}
                emptyMessage="No leaders returned yet."
                onPickSymbol={onPickSymbol}
                sourceLabel={leadersScored.anyComputed ? "ALPACA+Computed" : "ALPACA"}
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

            <div className="tpOppFootnote">Hover any pill to see full details. Prices are USD/share.</div>
          </CardShell>
        </div>
      </div>
    </section>
  );
}
