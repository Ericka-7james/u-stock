// frontend/src/components/dashboard/cards/TradePerformancePanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import BotControlCard from "./BotControlCard.jsx";
import TimeframeCard from "./TimeframeCard.jsx";
import "../../../css/dashboard/cards/TradePerformancePanel.css";

import { useAuth } from "../../../context/AuthContext";

import ConnectedBrokersMiniCard from "./shared/ConnectedBrokersMiniCard.jsx";
import OpportunityTable, { PillRow } from "./shared/OpportunityTable.jsx";
import { BigStat, MiniStat, CardShell } from "./shared/StatTiles.jsx";

import {
  nOrZero,
  nOrNull,
  fmtMoney,
  fmtPctWhole,
  isAlphaOnlySymbol,
  computePrevFallback,
} from "../../../lib/format/marketFormat.js";

import { TRADE_PERFORMANCE_PANEL_COPY as COPY } from "../../../content/dashboard/cards/tradePerformancePanel.content.ts";

import { fmtEpochSeconds } from "../../../lib/format/datetime.js";
import { computeInclusiveDays } from "../../../lib/time/timeframe.js";
import { safeStr } from "../../../lib/format/safe.js";

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
  return safeStr(it?.symbol, "").toUpperCase();
}

/* ----------------------------
   ✅ Bot state normalization
---------------------------- */

function normalizeEffectiveState(x) {
  const v = String(x || "").trim().toLowerCase();

  // NOTE: removed "degraded" (not part of your backend contract)
  const ok = new Set([
    "running",
    "waiting_for_market",
    "starting",
    "paused",
    "stopped",
    "offline",
    "error",
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

function hasAnyKeys(obj) {
  if (!obj || typeof obj !== "object") return false;
  return Object.keys(obj).length > 0;
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

  // ✅ FIX: "no heartbeat yet" is only a problem if bot is supposed to be active
  if (raw === null || raw === undefined) {
    const activeish = eff === "running" || eff === "waiting_for_market" || eff === "starting";
    return !activeish; // stopped-ish => OK, active-ish => not OK
  }

  const age = Number(raw);
  if (!Number.isFinite(age)) return false;

  return age >= 0 && age <= 180; // backend offline at 90s, UI buffer to 180s
}

function deriveBotUiState(botId, botStatuses) {
  const id = safeStr(botId, "");
  if (!id) {
    return { kind: "no_bot", runnerOnline: false, intent: "", eff: "stopped" };
  }

  const map = botStatuses && typeof botStatuses === "object" ? botStatuses : null;
  const s = map?.[id];

  // ✅ If we don't have a status payload yet, don't call it OFFLINE
  if (!hasAnyKeys(s)) {
    return { kind: "unknown", runnerOnline: null, intent: "", eff: "stopped" };
  }

  const eff = readEffectiveState(s);
  const intent = readIntent(s);
  const runnerOnline = readRunnerOnline(s);

  if (!runnerOnline || eff === "offline") {
    return { kind: "offline", runnerOnline: false, intent, eff };
  }

  // explicit STOPPED state (so UI says STOPPED, not IDLE)
  if (intent === "stopped" || eff === "stopped") return { kind: "stopped", runnerOnline, intent, eff };

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
  if (ui.kind === "unknown") return false;
  return true;
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
      if (!res.ok) throw new Error(data?.detail || COPY.cards.intents.errors.loadFail);

      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setTs(Number(data?.ts) || 0);
    } catch (e) {
      setErr(String(e?.message || e));
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
    if (!botId) return COPY.cards.intents.headerLines.selectBot;
    if (!botUi || botUi.kind === "no_bot") return COPY.cards.intents.headerLines.selectBot;
    if (botUi.kind === "unknown") return COPY.cards.intents.headerLines.unknown(botId);
    if (botUi.kind === "offline") return COPY.cards.intents.headerLines.offline(botId);
    if (botUi.kind === "paused") return COPY.cards.intents.headerLines.paused(botId);
    if (botUi.kind === "waiting") return COPY.cards.intents.headerLines.waiting(botId);
    if (botUi.kind === "starting") return COPY.cards.intents.headerLines.starting(botId);
    if (botUi.kind === "disarmed") return COPY.cards.intents.headerLines.disarmed(botId);
    if (botUi.kind === "stopped") return COPY.cards.intents.headerLines.stopped(botId);
    return COPY.cards.intents.headerLines.ok(botId);
  }, [botId, botUi]);

  return (
    <CardShell title={COPY.cards.intents.title} className="tpSpan2">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
          {headerLine} · {COPY.cards.intents.updatedPrefix}{" "}
          <span className="mono">{ts ? fmtEpochSeconds(ts) : COPY.cards.intents.updatedFallback}</span>
        </div>

        <button className="tpTab" type="button" onClick={refresh} disabled={!botId || busy} style={{ height: 34 }}>
          {COPY.cards.intents.refresh}
        </button>
      </div>

      {err ? (
        <div className="tpEmpty" style={{ marginTop: 10 }}>
          {COPY.cards.intents.errors.prefix} {err}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {busy && !items.length ? (
          <div className="tpEmpty">{COPY.cards.intents.states.loading}</div>
        ) : items.length ? (
          items.map((it, idx) => {
            const sym = safeSym(it);
            if (!isAlphaOnlySymbol(sym)) return null;

            const side = fmtSide(it?.side);
            const entry = nOrNull(it?.entry);
            const stop = nOrNull(it?.stop);
            const tp = nOrNull(it?.take_profit ?? it?.takeProfit ?? it?.tp);
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
            {!botId ? COPY.cards.intents.states.emptyNoBot : COPY.cards.intents.states.emptyNoIntents}
          </div>
        )}
      </div>

      <div className="tpOppFootnote" style={{ marginTop: 12 }}>
        {COPY.cards.intents.footnote}
      </div>
    </CardShell>
  );
}

/* ----------------------------
   Timeframe helpers (days)
---------------------------- */

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
        changePct: nOrZero(x?.changePct ?? x?.score),
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
        const last = nOrNull(l.last);
        let prev = nOrNull(l.prevClose);
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
      .sort((a, b) => nOrZero(b.score) - nOrZero(a.score))
      .slice(0, 6);

    return { rows, anyComputed };
  }, [leadersClean]);

  const aligned = useMemo(() => {
    const oppSet = new Map(oppStocks.map((x) => [String(x.symbol || "").toUpperCase(), x]));
    const out = [];

    for (const l of leadersClean) {
      const hit = oppSet.get(l.symbol);
      if (hit) {
        const botScore = nOrZero(hit.score);
        const moveScore = Math.abs(l.changePct);
        out.push({
          symbol: l.symbol,
          score: botScore + moveScore,
          sub: `Bot ${botScore.toFixed(2)} + Move ${moveScore.toFixed(2)}%`,
        });
      }
    }

    out.sort((a, b) => nOrZero(b.score) - nOrZero(a.score));
    return out.slice(0, 6);
  }, [leadersClean, oppStocks]);

  const safe = data || { start: "", end: "", trades: [] };
  const trades = Array.isArray(safe.trades) ? safe.trades : [];
  const winRate = trades.length ? (trades.filter((t) => nOrZero(t.pnl) > 0).length / trades.length) * 100 : 0;

  const botStatusValue =
    botUi.kind === "no_bot"
      ? COPY.stats.botStatus.values.empty
      : botUi.kind === "unknown"
      ? COPY.stats.botStatus.values.empty
      : botUi.kind === "offline"
      ? COPY.stats.botStatus.values.offline
      : botUi.kind === "paused"
      ? COPY.stats.botStatus.values.paused
      : botUi.kind === "waiting"
      ? COPY.stats.botStatus.values.waiting
      : botUi.kind === "starting"
      ? COPY.stats.botStatus.values.starting
      : botUi.kind === "running"
      ? COPY.stats.botStatus.values.running
      : botUi.kind === "disarmed"
      ? COPY.stats.botStatus.values.disarmed
      : botUi.kind === "armed"
      ? COPY.stats.botStatus.values.armed
      : botUi.kind === "stopped"
      ? COPY.stats.botStatus.values.stopped
      : COPY.stats.botStatus.values.idle;

  const botStatusSub =
    botUi.kind === "no_bot"
      ? COPY.stats.botStatus.subs.noBot
      : botUi.kind === "unknown"
      ? COPY.stats.botStatus.subs.unknown
      : botUi.kind === "offline"
      ? COPY.stats.botStatus.subs.offline
      : botUi.kind === "paused"
      ? COPY.stats.botStatus.subs.paused
      : botUi.kind === "waiting"
      ? COPY.stats.botStatus.subs.waiting
      : botUi.kind === "starting"
      ? COPY.stats.botStatus.subs.starting
      : botUi.kind === "running"
      ? COPY.stats.botStatus.subs.running
      : botUi.kind === "disarmed"
      ? COPY.stats.botStatus.subs.disarmed
      : botUi.kind === "armed"
      ? COPY.stats.botStatus.subs.armed
      : botUi.kind === "stopped"
      ? COPY.stats.botStatus.subs.stopped
      : COPY.stats.botStatus.subs.idle;

  const botStatusTone =
    botUi.kind === "running" || botUi.kind === "waiting" || botUi.kind === "starting" || botUi.kind === "paused"
      ? "pos"
      : botUi.kind === "offline"
      ? "neg"
      : "";

  const subtitle = useMemo(() => {
    if (!botId) return COPY.header.subtitles.noBot;
    if (botUi.kind === "paused") return COPY.header.subtitles.paused(botId);
    if (botUi.kind === "running") return COPY.header.subtitles.running(botId);
    if (botUi.kind === "waiting") return COPY.header.subtitles.waiting(botId);
    if (botUi.kind === "starting") return COPY.header.subtitles.starting(botId);
    if (botUi.kind === "offline") return COPY.header.subtitles.offline(botId);
    if (botUi.kind === "unknown") return COPY.header.subtitles.unknown(botId);
    if (botUi.kind === "disarmed") return COPY.header.subtitles.disarmed(botId);
    if (botUi.kind === "stopped") return COPY.header.subtitles.stopped(botId);
    return COPY.header.subtitles.fallback(botId);
  }, [botId, botUi.kind]);

  const rangeDays = useMemo(() => computeRangeDaysLabel(timeframe), [timeframe]);

  const hasBotOpportunities = oppStocks.length > 0;

  const { user } = useAuth();
  const storageScope = user?.id ? `user:${user.id}` : "";

  const alignedEmptyMessage =
    !botId
      ? COPY.cards.topDayTrades.tables.aligned.empty.noBot
      : !hasBotOpportunities
      ? COPY.cards.topDayTrades.tables.aligned.empty.noOpp
      : botUi.kind === "offline"
      ? COPY.cards.topDayTrades.tables.aligned.empty.offline
      : COPY.cards.topDayTrades.tables.aligned.empty.noOverlap;

  const leadersSourceLabel = leadersScored.anyComputed
    ? COPY.cards.topDayTrades.tables.leaders.sources.computed
    : COPY.cards.topDayTrades.tables.leaders.sources.plain;

  return (
    <section className="tpPanel">
      <div className="tpHeaderBar">
        <div className="tpHeaderLeft">
          <div className="tpTitleRow">
            <h2 className="tpTitleText">{COPY.header.title}</h2>
          </div>

          <p className="tpSubtitle">{subtitle}</p>
        </div>

        <div className="tpTabs tpTimeframeStack">
          <TimeframeCard variant="inline" value={timeframe} onChange={onTimeframeChange} />

          <div className="tpActiveRangeDays" aria-label={COPY.header.range.aria}>
            {COPY.header.range.labelPrefix}{" "}
            <strong className="tpActiveRangeStrong">{rangeDays?.label || COPY.header.range.fallbackLabel}</strong>
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
              storageScope={storageScope}
            />
          </div>

          <BigStat label={COPY.stats.botStatus.label} value={botStatusValue} sub={botStatusSub} tone={botStatusTone} />
          <BigStat
            label={COPY.stats.tradesContext.label}
            value={`${trades.length}`}
            sub={`${COPY.stats.tradesContext.winRatePrefix} ${fmtPctWhole(winRate)}`}
          />

          <div className="tpMiniGrid">
            <MiniStat label={COPY.stats.mini.leaders} value={String(leadersClean.length)} />
            <MiniStat label={COPY.stats.mini.aligned} value={String(aligned.length)} tone={aligned.length ? "pos" : ""} />
            <MiniStat label={COPY.stats.mini.internal} value={String(oppStocks.length)} />
          </div>

          <BotIntentsCard botUi={botUi} botId={botId} onPickSymbol={onPickSymbol} />

          <CardShell title={COPY.cards.topDayTrades.title} className="tpSpan2">
            <div className="tpOppGrid">
              <OpportunityTable
                title={COPY.cards.topDayTrades.tables.aligned.title}
                rows={hasBotOpportunities ? aligned : []}
                emptyMessage={alignedEmptyMessage}
                onPickSymbol={onPickSymbol}
                isValidSymbol={isAlphaOnlySymbol}
              />

              <OpportunityTable
                title={COPY.cards.topDayTrades.tables.leaders.title}
                rows={leadersScored.rows}
                emptyMessage={COPY.cards.topDayTrades.tables.leaders.empty}
                onPickSymbol={onPickSymbol}
                sourceLabel={leadersSourceLabel}
                isValidSymbol={isAlphaOnlySymbol}
              />

              <OpportunityTable
                title={COPY.cards.topDayTrades.tables.internal.title}
                rows={(oppStocks || []).slice(0, 6).map((r) => ({
                  symbol: r.symbol,
                  score: r.score,
                  sub: r.reason ? String(r.reason) : "",
                }))}
                emptyMessage={COPY.cards.topDayTrades.tables.internal.empty}
                onPickSymbol={onPickSymbol}
                isValidSymbol={isAlphaOnlySymbol}
              />
            </div>

            <div className="tpOppFootnote">{COPY.cards.topDayTrades.footnote}</div>
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