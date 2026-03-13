// frontend/src/components/dashboard/cards/shared/BotIntentsCard.jsx
import { useMemo } from "react";
import OpportunityTable, { PillRow } from "./OpportunityTable.jsx";
import { CardShell } from "./StatTiles.jsx";

import useBotIntents from "../../../../hooks/bots/useBotIntents.js";

import { nOrNull, fmtMoney, isAlphaOnlySymbol } from "../../../../lib/format/marketFormat.js";
import { safeStr } from "../../../../lib/format/safe.js";
import { fmtEpochSeconds } from "../../../../lib/format/datetime.js";

import { TRADE_PERFORMANCE_PANEL_COPY as COPY } from "../../../../content/dashboard/cards/tradePerformancePanel.content.ts";

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

// local helper (matches your prior gating)
function isBotActiveForUi(ui) {
  if (!ui) return false;
  if (ui.kind === "no_bot") return false;
  if (ui.kind === "offline") return false;
  if (ui.kind === "unknown") return false;
  return true;
}

export default function BotIntentsCard({ botUi, botId, onPickSymbol }) {
  const shouldPoll = isBotActiveForUi(botUi);

  const { items, ts, busy, err, refresh } = useBotIntents({
    botId,
    enabled: shouldPoll,
    limit: 10,
    pollMs: 7000,
  });

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