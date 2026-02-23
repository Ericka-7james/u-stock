// frontend/src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState } from "react";
import AppShell from "../layout/AppShell.jsx";
import { useAuth } from "../../context/AuthContext";

import PriceChartPanel from "./cards/PriceChartPanel.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";
import MacroCard from "./cards/MacroCard.jsx";
import TradePerformancePanel from "./cards/TradePerformancePanel.jsx";
import MarketLeadersCard from "./cards/MarketLeadersCard.jsx";

import { useAlpacaDailyBars } from "../../hooks/useAlpacaDailyBars.js";
import { useAlpacaTradeSummary } from "../../hooks/useAlpacaTradeSummary.js";

import ErrorModal from "../common/ErrorModal.jsx";
import ErrorBanner from "../common/ErrorBanner.jsx";
import { explainAnyError } from "../../lib/errorMessages.jsx";

import useIsDarkMode from "../../hooks/common/useIsDarkMode.js";
import useBotOpportunities from "../../hooks/dashboard/useBotOpportunities.js";
import useMarketLeaders from "../../hooks/dashboard/useMarketLeaders.js";
import useConnectBotNudge from "../../hooks/dashboard/useConnectBotNudge.js";

import { LS } from "../../lib/storage/keys.js";
import { lsGet, lsSet } from "../../lib/storage/localStorage.js";
import { normalizeSymbol, isTvSafe } from "../../lib/symbols.js";

import { DASHBOARD_PAGE_COPY as COPY } from "../../content/dashboard.content.js";

import "../../css/dashboard/DashboardPage.css";
import "../../css/dashboard/cards/ChartControls.css";
import "../../css/dashboard/cards/CardShared.css";

function loadLastTicker() {
  const v = lsGet(LS.LAST_TICKER, "");
  const s = String(v || "").trim().toUpperCase();
  return s || COPY.defaults.fallbackTicker;
}

export default function DashboardPage() {
  const { isAuthed, loading: authLoading } = useAuth();

  const [currentTicker, setCurrentTicker] = useState(loadLastTicker);
  const [timeframe, setTimeframe] = useState(null);

  // ✅ Error modal (kept, even if currently unused)
  const [errOpen, setErrOpen] = useState(false);
  const [errPayload, setErrPayload] = useState(null);

  const closeErr = () => {
    setErrOpen(false);
    setErrPayload(null);
  };

  // ✅ Connect-bot nudge (hook owns the logic + localStorage flags + navigation)
  const connectNudge = useConnectBotNudge({
    botAvailablePath: "/api/bots/available",
    connectHref: "/bots",
  });

  if (authLoading || !isAuthed) return null;

  useEffect(() => {
    lsSet(LS.LAST_TICKER, currentTicker);
  }, [currentTicker]);

  const isDarkMode = useIsDarkMode();

  const { bars, loading: alpacaLoading, error: alpacaError, meta: alpacaMeta } =
    useAlpacaDailyBars(currentTicker, 220);

  const historyBySymbol = useMemo(() => ({ [currentTicker]: bars || [] }), [bars, currentTicker]);

  const { data: tradePerfData, loading: tradePerfLoading, error: tradePerfError } =
    useAlpacaTradeSummary("Week", {});

  const tradeErrUI = tradePerfError ? explainAnyError(tradePerfError) : null;
  const barsErrUI = alpacaError ? explainAnyError(alpacaError) : null;

  const { data: oppData, loading: oppLoading, error: oppError } = useBotOpportunities();
  const oppErrUI = oppError ? explainAnyError(oppError) : null;

  const { data: leadersResp, loading: leadersLoading, error: leadersError } = useMarketLeaders();
  const leadersErrUI = leadersError ? explainAnyError(leadersError) : null;

  const leadersItems = useMemo(() => leadersResp?.items || [], [leadersResp]);

  return (
    <AppShell>
      <ErrorModal open={errOpen} error={errPayload} onClose={closeErr} />

      <ErrorModal
        open={connectNudge.open}
        error={connectNudge.payload}
        onClose={connectNudge.onClose}
        onAction={connectNudge.onAction}
      />

      <div className="dashboard-page-wrap">
        <main className="dashboard-main">
          <div className="dashboard-left">
            <TradePerformancePanel
              data={tradePerfData || { trades: [] }}
              opportunities={oppData}
              leaders={leadersItems}
              onPickSymbol={(s) => isTvSafe(s) && setCurrentTicker(normalizeSymbol(s))}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />

            {tradePerfLoading && <div className="muted">{COPY.loading.generic}</div>}
            {oppLoading && <div className="muted">{COPY.loading.generic}</div>}
            {leadersLoading && <div className="muted">{COPY.loading.leaders}</div>}

            {tradeErrUI && <ErrorBanner title={tradeErrUI.title} body={tradeErrUI.body} />}
            {oppErrUI && <ErrorBanner title={oppErrUI.title} body={oppErrUI.body} />}
            {leadersErrUI && <ErrorBanner title={leadersErrUI.title} body={leadersErrUI.body} />}
          </div>

          <div className="dashboard-right">
            <PriceChartPanel
              currentTicker={currentTicker}
              onSelectTicker={setCurrentTicker}
              isDarkMode={isDarkMode}
              timeframeLabel={timeframe?.label}
            />

            <section className="panel">
              {barsErrUI ? <ErrorBanner title={barsErrUI.title} body={barsErrUI.body} /> : null}

              <SentimentCard symbol={currentTicker} historyBySymbol={historyBySymbol} loading={alpacaLoading} />

              {alpacaMeta?.fetchedAt ? (
                <div className="muted">
                  {COPY.labels.alpacaFetchedPrefix} {new Date(alpacaMeta.fetchedAt).toLocaleString()}
                </div>
              ) : null}
            </section>

            <MarketLeadersCard
              items={leadersItems}
              loading={leadersLoading}
              onSelectSymbol={(s) => isTvSafe(s) && setCurrentTicker(normalizeSymbol(s))}
            />

            <MacroCard />
          </div>
        </main>
      </div>
    </AppShell>
  );
}