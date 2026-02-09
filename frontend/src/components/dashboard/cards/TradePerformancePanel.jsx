// frontend/src/components/dashboard/cards/TradePerformancePanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BotControlCard from "./BotControlCard.jsx";
import TimeframeCard from "./TimeframeCard.jsx";
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

// ✅ STRICT: only A–Z (no dots, dashes, numbers)
function isAlphaOnlySymbol(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
}

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

function ConnectedBrokersMiniCard() {
  return (
    <Link to="/connected-apps" className="connected-mini-card" aria-label="Go to Connected Brokers">
      <div className="connected-mini-title">Connected brokers</div>
      <div className="connected-mini-sub">Manage Alpaca/Polygon keys and integrations →</div>
    </Link>
  );
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

/* ----------------------------
   ✅ Bot state normalization
---------------------------- */

function normalizeEffectiveState(x) {
  const v = String(x || "").trim().toLowerCase();

  const ok = new Set([
    "running",
    "waiting_for_market",
    "starting",
    "paused",
    "stopped",
    "offline",
    "error",
    "degraded",
    "idle",
    "armed",
    "disarmed",
  ]);

  return ok.has(v) ? v : v || "stopped";
}

function readEffectiveState(s) {
  if (!s || typeof s !== "object") return "stopped";
  return normalizeEffectiveState(
    s.effective_state ??
      s.effectiveState ??
      s.effective ??
      s.effective_status ??
      s.effectiveStatus ??
      s.state ??
      s.status
  );
}

function readIntent(s) {
  if (!s || typeof s !== "object") return "";
  return String(s.intent ?? s.target_intent ?? s.desired_intent ?? "").trim().toLowerCase();
}

function readRunnerOnline(s) {
  // If backend explicitly says offline, trust it
  const eff = readEffectiveState(s);
  if (eff === "offline") return false;

  const raw =
    s?.heartbeatAgeSec ??
    s?.heartbeat_age_s ??
    s?.heartbeatAgeS ??
    s?.heartbeat_age ??
    s?.heartbeatAge ??
    null;

  // IMPORTANT: null/undefined means “no heartbeat yet”
  if (raw === null || raw === undefined) return false;

  const age = Number(raw);
  if (!Number.isFinite(age)) return false;

  // stale threshold should match backend “offline” (90s) plus buffer
  return age >= 0 && age <= 180;
}

function deriveBotUiState(botId, botStatuses) {
  const id = String(botId || "").trim();
  if (!id) {
    return { kind: "no_bot", runnerOnline: false, intent: "", eff: "stopped" };
  }

  const s = botStatuses?.[id] || {};
  const eff = readEffectiveState(s);
  const intent = readIntent(s);
  const runnerOnline = readRunnerOnline(s);

  if (!runnerOnline || eff === "offline") {
    return { kind: "offline", runnerOnline: false, intent, eff };
  }

  if (intent === "paused" || eff === "paused") return { kind: "paused", runnerOnline, intent, eff };
  if (intent === "running" || eff === "running") return { kind: "running", runnerOnline, intent, eff };
  if (eff === "waiting_for_market") return { kind: "waiting", runnerOnline, intent, eff };
  if (eff === "starting") return { kind: "starting", runnerOnline, intent, eff };
  if (intent === "disarmed" || eff === "disarmed") return { kind: "disarmed", runnerOnline, intent, eff };
  if (intent === "armed" || eff === "armed") return { kind: "armed", runnerOnline, intent, eff };

  return { kind: "idle", runnerOnline, intent, eff };
}

function isBotActiveForUi(ui) {
  if (!ui) return false;
  if (ui.kind === "no_bot") return false;
  if (ui.kind === "offline") return false;
  return true; // paused still counts (show last snapshots)
}

function BotIntentsCard({ botUi, botId, onPickSymbol }) {
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
      // Keep last snapshot if any (don’t hard-wipe)
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const id = String(botId || "").trim();

    if (!id) {
      setItems([]);
      setTs(0);
      setErr("");
      lastBotIdRef.current = "";
      return;
    }

    if (lastBotIdRef.current && lastBotIdRef.current !== id) {
      setItems([]);
      setTs(0);
      setErr("");
    }
    lastBotIdRef.current = id;

    refresh();

    const shouldPoll = isBotActiveForUi(botUi);
    if (!shouldPoll) return;

    const t = setInterval(() => refresh(), 7000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, botUi?.kind]);

  const headerLine = useMemo(() => {
    if (!botId) return "Select a bot to view intents.";
    if (!botUi || botUi.kind === "no_bot") return "Select a bot to view intents.";
    if (botUi.kind === "offline") return `Runner offline — showing last known intents for ${botId}.`;
    if (botUi.kind === "paused") return `Bot paused — showing last intents for ${botId}.`;
    if (botUi.kind === "waiting") return `Waiting for market — latest intents for ${botId}.`;
    if (botUi.kind === "starting") return `Starting — latest intents for ${botId}.`;
    if (botUi.kind === "disarmed") return `Bot disarmed — last intents (if any) for ${botId}.`;
    return `Showing latest 10 from ${botId}.`;
  }, [botId, botUi]);

  return (
    <CardShell title="Bot Intents" className="tpSpan2">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
          {headerLine} · Updated <span className="mono">{ts ? fmtTime(ts) : "—"}</span>
        </div>

        <button className="tpTab" type="button" onClick={refresh} disabled={!botId || busy} style={{ height: 34 }}>
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

            const sub = `Entry ${entry === null ? "—" : fmtMoney(entry)} · Stop ${
              stop === null ? "—" : fmtMoney(stop)
            } · TP ${tp === null ? "—" : fmtMoney(tp)} · Conf ${fmtConf(conf)}`;

            const score = Number.isFinite(Number(conf)) ? Number(conf) : null;

            return (
              <PillRow
                key={`${sym}-${idx}`}
                symbol={`${sym} · ${side}`}
                score={score}
                sub={sub}
                onClick={onPickSymbol ? () => onPickSymbol(sym) : undefined}
              />
            );
          })
        ) : (
          <div className="tpEmpty">
            {!botId ? "Select a bot to view intents." : "No intents yet. (When bot submits intents, they show here.)"}
          </div>
        )}
      </div>

      <div className="tpOppFootnote" style={{ marginTop: 12 }}>
        Click an intent to load the symbol in the chart. Intents are suggestions, not orders.
      </div>
    </CardShell>
  );
}

/* ----------------------------
   Timeframe helpers (days)
---------------------------- */

function parseDateLoose(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d?.getTime?.()) ? d : null;
}

function computeInclusiveDays(start, end) {
  const a = parseDateLoose(start);
  const b = parseDateLoose(end);
  if (!a || !b) return null;

  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

function computeRangeDaysLabel(timeframe) {
  if (!timeframe) return { days: 7, label: "7 days" };

  const start = timeframe?.start ?? timeframe?.from ?? timeframe?.date_from ?? timeframe?.time_min;
  const end = timeframe?.end ?? timeframe?.to ?? timeframe?.date_to ?? timeframe?.time_max;

  const d = computeInclusiveDays(start, end);
  if (d !== null) return { days: d, label: `${d} day${d === 1 ? "" : "s"}` };

  return { days: null, label: "—" };
}

export default function TradePerformancePanel({
  data,
  opportunities = null,
  leaders = [],
  onPickSymbol,

  timeframe = null,
  onTimeframeChange,

  activeBot = null,
  botStatuses = null,
  onStartBot,
  onStopBot,
}) {
  const [selectedBotId, setSelectedBotId] = useState(() => String(activeBot?.id || "").trim());

  useEffect(() => {
    const next = String(activeBot?.id || "").trim();
    if (next && next !== selectedBotId) setSelectedBotId(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBot?.id]);

  const botId = String(selectedBotId || "").trim();

  const botUi = useMemo(() => deriveBotUiState(botId, botStatuses), [botId, botStatuses]);

  const oppStocks = useMemo(() => {
    const raw = Array.isArray(opportunities?.stocks) ? opportunities.stocks : [];
    return raw
      .map((x) => ({ ...x, symbol: String(x?.symbol || "").toUpperCase().trim() }))
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

  const safe = data || { start: "", end: "", trades: [] };
  const trades = Array.isArray(safe.trades) ? safe.trades : [];
  const winRate = trades.length ? (trades.filter((t) => n(t.pnl) > 0).length / trades.length) * 100 : 0;

  const botStatusValue =
    botUi.kind === "no_bot"
      ? "—"
      : botUi.kind === "offline"
      ? "OFFLINE"
      : botUi.kind === "paused"
      ? "PAUSED"
      : botUi.kind === "waiting"
      ? "WAITING"
      : botUi.kind === "starting"
      ? "STARTING"
      : botUi.kind === "running"
      ? "LIVE"
      : botUi.kind === "disarmed"
      ? "DISARMED"
      : botUi.kind === "armed"
      ? "ARMED"
      : "IDLE";

  const botStatusSub =
    botUi.kind === "no_bot"
      ? "Select a bot to enable bot-aligned picks."
      : botUi.kind === "offline"
      ? "Runner offline — no heartbeat."
      : botUi.kind === "paused"
      ? "Paused by user."
      : botUi.kind === "waiting"
      ? "Waiting for market open."
      : botUi.kind === "starting"
      ? "Booting up…"
      : botUi.kind === "running"
      ? "Using bot alignment"
      : botUi.kind === "disarmed"
      ? "Bot disabled"
      : botUi.kind === "armed"
      ? "Ready to run"
      : "Standing by";

  const botStatusTone =
    botUi.kind === "running" || botUi.kind === "waiting" || botUi.kind === "starting" || botUi.kind === "paused"
      ? "pos"
      : botUi.kind === "offline"
      ? "neg"
      : "";

  const subtitle = useMemo(() => {
    if (!botId) return "No bot selected — choose a bot to enable bot-aligned picks.";
    if (botUi.kind === "paused") return `Bot paused: ${botId}`;
    if (botUi.kind === "running") return `Bot live: ${botId}`;
    if (botUi.kind === "waiting") return `Bot waiting: ${botId}`;
    if (botUi.kind === "starting") return `Bot starting: ${botId}`;
    if (botUi.kind === "offline") return `Bot offline: ${botId}`;
    if (botUi.kind === "disarmed") return `Bot disarmed: ${botId}`;
    return `Bot: ${botId}`;
  }, [botId, botUi.kind]);

  const rangeDays = useMemo(() => computeRangeDaysLabel(timeframe), [timeframe]);

  const hasBotOpportunities = oppStocks.length > 0;

  return (
    <section className="tpPanel">
      <div className="tpHeaderBar">
        <div className="tpHeaderLeft">
          <div className="tpTitleRow">
            <h2 className="tpTitleText">Opportunities</h2>
          </div>

          <p className="tpSubtitle">{subtitle}</p>
        </div>

        <div className="tpTabs tpTimeframeStack">
          <TimeframeCard variant="inline" value={timeframe} onChange={onTimeframeChange} />

          <div className="tpActiveRangeDays" aria-label="Active range days">
            Active range: <strong className="tpActiveRangeStrong">{rangeDays?.label || "—"}</strong>
          </div>
        </div>
      </div>

      <div className="tpLeft">
        <div className="tpLeftGrid">
          <div className="tpSpan2">
            <BotControlCard
              activeBotId={botId || undefined}
              onActiveBotChange={(nextId) => setSelectedBotId(String(nextId || "").trim())}
              onStartBot={onStartBot}
              onStopBot={onStopBot}
            />
          </div>

          <BigStat label="Bot Status" value={botStatusValue} sub={botStatusSub} tone={botStatusTone} />
          <BigStat label="Trades Context" value={`${trades.length}`} sub={`Win rate ${fmtPct(winRate)}`} />

          <div className="tpMiniGrid">
            <MiniStat label="Leaders" value={String(leadersClean.length)} />
            <MiniStat label="Aligned" value={String(aligned.length)} tone={aligned.length ? "pos" : ""} />
            <MiniStat label="Internal Picks" value={String(oppStocks.length)} />
          </div>

          <BotIntentsCard botUi={botUi} botId={botId} onPickSymbol={onPickSymbol} />

          <CardShell title="Top Day Trades (Opportunity)" className="tpSpan2">
            <div className="tpOppGrid">
              <OpportunityTable
                title="Bot-aligned (leaders ∩ bot)"
                rows={hasBotOpportunities ? aligned : []}
                emptyMessage={
                  !botId
                    ? "Select a bot to enable aligned picks."
                    : !hasBotOpportunities
                    ? "No bot opportunities yet."
                    : botUi.kind === "offline"
                    ? "Runner offline — last alignment may be stale."
                    : "No overlap yet."
                }
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

          <div className="tpSpan2" style={{ marginTop: 12 }}>
            <ConnectedBrokersMiniCard />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * TODOs / likely breakpoints:
 * - If botStatuses shape changes, ensure heartbeatAgeSec/effective_state keys remain mapped.
 * - If you add OTC/crypto symbols, relax isAlphaOnlySymbol() (currently blocks dots/dashes/numbers).
 * - If leader/opportunity sources return lowercase or extra metadata, normalize upstream before rendering.
 * - If polling causes load, gate polling only to running/waiting (instead of paused).
 */
