// frontend/src/components/dashboard/cards/TradePerformancePanel.jsx
import { useEffect, useMemo, useState } from "react";
import BotControlCard from "./BotControlCard.jsx";
import TimeframeCard from "./TimeframeCard.jsx";
import "../../../css/dashboard/cards/TradePerformancePanel.css";

import { useAuth } from "../../../context/authContextBase.js";

import ConnectedBrokersMiniCard from "./shared/ConnectedBrokersMiniCard.jsx";
import OpportunityTable from "./shared/OpportunityTable.jsx";
import BotIntentsCard from "./shared/BotIntentsCard.jsx";
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

import { computeRangeDaysLabel } from "../../../lib/time/timeframe.js";
import { safeStr } from "../../../lib/format/safe.js";

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

  // ✅ "no heartbeat yet" is only a problem if bot is supposed to be active
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