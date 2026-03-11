// frontend/src/components/dashboard/DashboardPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell.jsx";
import { useAuth } from "../../context/authContextBase.js";

import PriceChartPanel from "./cards/PriceChartPanel.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";
import MacroCard from "./cards/MacroCard.jsx";
import TradePerformancePanel from "./cards/TradePerformancePanel.jsx";
import MarketLeadersCard from "./cards/MarketLeadersCard.jsx";

import { useAlpacaDailyBars } from "../../hooks/useAlpacaDailyBars.js";
import { useAlpacaTradeSummary } from "../../hooks/useAlpacaTradeSummary.js";

import ErrorModal from "../common/ErrorModal.jsx";
import ErrorBanner from "../common/ErrorBanner.jsx";
import { explainAnyError } from "../../lib/ErrorMessages.jsx";

import useIsDarkMode from "../../hooks/common/useIsDarkMode.js";
import { useBotOpportunities } from "../../hooks/dashboard/useBotOpportunities.js";
import useMarketLeaders from "../../hooks/dashboard/useMarketLeaders.js";
import useConnectBotNudge from "../../hooks/dashboard/useConnectBotNudge.js";

import WelcomeConnectModal from "./WelcomeConnectModal.jsx";
import welcomeSquirrel from "../../assets/icons/WelcomeSquirrel.png";

import { LS } from "../../lib/storage/keys.js";
import { lsGet, lsSet } from "../../lib/storage/localStorage.js";
import { normalizeSymbol, isTvSafe } from "../../lib/symbols.js";

import { DASHBOARD_PAGE_COPY as COPY } from "../../content/pages/dashboard.content.ts";

import "../../css/dashboard/DashboardPage.css";
import "../../css/dashboard/cards/ChartControls.css";
import "../../css/dashboard/cards/CardShared.css";

/**
 * Loads the last selected ticker symbol from localStorage.
 *
 * Falls back to the dashboard default ticker if none exists.
 *
 * @returns {string}
 */
function loadLastTicker() {
  const v = lsGet(LS.LAST_TICKER, "");
  const s = String(v || "").trim().toUpperCase();
  return s || COPY.defaults.fallbackTicker;
}

/**
 * Generates a user-scoped storage key.
 *
 * Prevents collisions between multiple users
 * sharing the same browser environment.
 *
 * @param {string} base
 * @param {string} scope
 * @returns {string}
 */
function scopedKey(base, scope) {
  const s = String(scope || "").trim();
  return s ? `${base}::${s}` : base;
}

/**
 * Safe wrapper for sessionStorage.getItem.
 *
 * Some environments (private browsing, embedded webviews)
 * can throw storage exceptions.
 *
 * @param {string} key
 * @returns {string|null}
 */
function ssGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safe wrapper for sessionStorage.setItem.
 *
 * @param {string} key
 * @param {string} val
 */
function ssSet(key, val) {
  try {
    window.sessionStorage.setItem(key, val);
  } catch {
    // ignore storage errors
  }
}

const SELECTED_BOT_KEY_BASE = "ustock:selected_bot_id_v1";
const WELCOME_SHOWN_SESSION_BASE = "ustock:welcome_connect_shown_session_v1";

/**
 * Dashboard page for authenticated users.
 *
 * Responsibilities:
 * - orchestrate dashboard layout
 * - manage ticker state
 * - fetch trading / market data
 * - surface API errors
 * - show onboarding connect modal
 *
 * @returns {JSX.Element|null}
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { isAuthed, loading: authLoading, user } = useAuth();

  const [currentTicker, setCurrentTicker] = useState(loadLastTicker);
  const [timeframe, setTimeframe] = useState(null);

  const [errOpen, setErrOpen] = useState(false);
  const [errPayload, setErrPayload] = useState(null);

  const closeErr = () => {
    setErrOpen(false);
    setErrPayload(null);
  };

  const connectNudge = useConnectBotNudge({
    botAvailablePath: "/api/bots/available",
    connectHref: "/bots",
  });

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const prevAuthedRef = useRef(false);

  /**
   * Detect login edge and decide if welcome modal should appear.
   */
  useEffect(() => {
    if (authLoading) return;

    const prev = prevAuthedRef.current;
    const now = Boolean(isAuthed);

    prevAuthedRef.current = now;

    // Only trigger when auth flips false -> true
    if (!now || prev === true) return;

    const uid = String(user?.id || "").trim();
    if (!uid) return;

    const dismissedKey = scopedKey(LS.WELCOME_CONNECT_DISMISSED, uid);
    const dismissed = String(lsGet(dismissedKey, "") || "") === "1";
    if (dismissed) return;

    const shownKey = scopedKey(WELCOME_SHOWN_SESSION_BASE, uid);
    const alreadyShownThisSession = ssGet(shownKey) === "1";
    if (alreadyShownThisSession) return;

    const selectedBotKey = scopedKey(SELECTED_BOT_KEY_BASE, uid);
    const selectedBotId = String(lsGet(selectedBotKey, "") || "").trim();

    if (!selectedBotId) {
      queueMicrotask(() => setWelcomeOpen(true));
      ssSet(shownKey, "1");
    }
  }, [authLoading, isAuthed, user?.id]);

  const closeWelcome = () => {
    const uid = String(user?.id || "").trim();
    if (uid) {
      const dismissedKey = scopedKey(LS.WELCOME_CONNECT_DISMISSED, uid);
      lsSet(dismissedKey, "1");
    }
    setWelcomeOpen(false);
  };

  const goConnect = () => {
    setWelcomeOpen(false);
    navigate("/bots");
  };

  /**
   * Persist ticker selection
   */
  useEffect(() => {
    lsSet(LS.LAST_TICKER, currentTicker);
  }, [currentTicker]);

  const isDarkMode = useIsDarkMode();

  const { bars, loading: alpacaLoading, error: alpacaError, meta: alpacaMeta } =
    useAlpacaDailyBars(currentTicker, 220);

  const historyBySymbol = useMemo(() => {
    if (!bars) return {};
    return { [currentTicker]: bars };
  }, [bars, currentTicker]);

  const { data: tradePerfData, loading: tradePerfLoading, error: tradePerfError } =
    useAlpacaTradeSummary("Week", {});

  const { data: oppData, loading: oppLoading, error: oppError } =
    useBotOpportunities();

  const { data: leadersResp, loading: leadersLoading, error: leadersError } =
    useMarketLeaders();

  const leadersItems = useMemo(() => leadersResp?.items || [], [leadersResp]);

  const tradeErrUI = tradePerfError ? explainAnyError(tradePerfError) : null;
  const barsErrUI = alpacaError ? explainAnyError(alpacaError) : null;
  const oppErrUI = oppError ? explainAnyError(oppError) : null;
  const leadersErrUI = leadersError ? explainAnyError(leadersError) : null;

  const isDashboardLoading =
    tradePerfLoading || oppLoading || leadersLoading;

  /**
   * Shared symbol selection handler
   */
  const handleSymbolSelect = (s) => {
    if (!isTvSafe(s)) return;
    setCurrentTicker(normalizeSymbol(s));
  };

  if (authLoading || !isAuthed) return null;

  return (
    <AppShell>
      <ErrorModal open={errOpen} error={errPayload} onClose={closeErr} />

      <ErrorModal
        open={connectNudge.open}
        error={connectNudge.payload}
        onClose={connectNudge.onClose}
        onAction={connectNudge.onAction}
      />

      <WelcomeConnectModal
        open={welcomeOpen}
        onClose={closeWelcome}
        onConnect={goConnect}
        welcomeImage={welcomeSquirrel}
      />

      <div className="dashboard-page-wrap">
        <main className="dashboard-main">

          <div className="dashboard-left">

            <TradePerformancePanel
              data={tradePerfData || { trades: [] }}
              opportunities={oppData}
              leaders={leadersItems}
              onPickSymbol={handleSymbolSelect}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />

            {isDashboardLoading && (
              <div className="muted">{COPY.loading.generic}</div>
            )}

            {tradeErrUI && (
              <ErrorBanner title={tradeErrUI.title} body={tradeErrUI.body} />
            )}

            {oppErrUI && (
              <ErrorBanner title={oppErrUI.title} body={oppErrUI.body} />
            )}

            {leadersErrUI && (
              <ErrorBanner title={leadersErrUI.title} body={leadersErrUI.body} />
            )}

          </div>

          <div className="dashboard-right">

            <PriceChartPanel
              currentTicker={currentTicker}
              onSelectTicker={setCurrentTicker}
              isDarkMode={isDarkMode}
              timeframeLabel={timeframe?.label}
            />

            <section className="panel">

              {barsErrUI && (
                <ErrorBanner title={barsErrUI.title} body={barsErrUI.body} />
              )}

              <SentimentCard
                symbol={currentTicker}
                historyBySymbol={historyBySymbol}
                loading={alpacaLoading}
              />

              {alpacaMeta?.fetchedAt && (
                <div className="muted">
                  {COPY.labels.alpacaFetchedPrefix}
                  {" "}
                  {new Date(alpacaMeta.fetchedAt).toLocaleString()}
                </div>
              )}

            </section>

            <MarketLeadersCard
              items={leadersItems}
              loading={leadersLoading}
              onSelectSymbol={handleSymbolSelect}
            />

            <MacroCard />

          </div>

        </main>
      </div>
    </AppShell>
  );
}