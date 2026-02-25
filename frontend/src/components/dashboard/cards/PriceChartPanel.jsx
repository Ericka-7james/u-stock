// frontend/src/components/dashboard/cards/PriceChartPanel.jsx
import { useEffect, useMemo, useRef } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";

import { normalizeSymbol } from "../../../lib/symbols.js";
import { prettyTvInterval } from "../../../lib/format/tradingview.js";

import { PRICE_CHART_PANEL_COPY as COPY } from "../../../content/dashboard/cards/priceChartPanel.content.ts";

import "../../../css/dashboard/cards/PriceChartPanel.css";

function loadTradingViewScript() {
  return new Promise((resolve, reject) => {
    if (window.TradingView?.widget) return resolve();

    const existing = document.querySelector('script[data-tv="true"]');
    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.dataset.tv = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function PriceChartPanel({
  currentTicker = COPY.fallbacks.symbol,
  isDarkMode = false,
  timeframeLabel = "Past week", // (you can content-ize later if you want; currently unused here)
  activeRangeLabel = "",
  interval = COPY.fallbacks.interval,
}) {
  const containerIdRef = useRef(`tv-${Math.random().toString(16).slice(2)}`);
  const widgetRef = useRef(null);

  const intervalLabel = useMemo(() => prettyTvInterval(interval), [interval]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await loadTradingViewScript();
        if (!alive) return;

        const symbol = normalizeSymbol(currentTicker) || COPY.fallbacks.symbol;

        const containerEl = document.getElementById(containerIdRef.current);
        if (containerEl) containerEl.innerHTML = "";
        widgetRef.current = null;

        widgetRef.current = new window.TradingView.widget({
          container_id: containerIdRef.current,
          symbol,
          interval: String(interval || COPY.fallbacks.interval),
          autosize: true,
          theme: isDarkMode ? "dark" : "light",
          locale: "en",
          allow_symbol_change: true,
          hide_top_toolbar: false,
          hide_side_toolbar: false,
          withdateranges: false,
          save_image: false,
        });
      } catch (e) {
        console.error(COPY.errors.initFailedPrefix, e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isDarkMode, currentTicker, interval]);

  return (
    <section className="panel panel-chart">
      <div className="card-main-chart">
        <div className="card-header">
          <div className="card-header-left">
            <div className="card-title-row">
              <h2 className="card-title-text">{COPY.title}</h2>

              <HelpTooltip title={COPY.tooltip.title}>
                {COPY.tooltip.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                <p className="help-popover__note">{COPY.tooltip.note}</p>
              </HelpTooltip>
            </div>

            <p className="card-subtitle">
              {COPY.subtitle.candleIntervalPrefix} <strong>{intervalLabel}</strong>
              {activeRangeLabel ? (
                <>
                  {COPY.subtitle.dot}
                  <span style={{ opacity: 0.85 }}>{activeRangeLabel}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="tv-chart-wrapper">
          <div id={containerIdRef.current} className="tv-chart-inner" />
        </div>
      </div>
    </section>
  );
}