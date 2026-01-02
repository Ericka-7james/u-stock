// src/components/dashboard/cards/PriceChartPanel.jsx
import { useEffect, useId, useRef } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import "../../../css/dashboard/cards/PriceChartPanel.css";

function loadTradingViewScript() {
  return new Promise((resolve, reject) => {
    if (window.TradingView && window.TradingView.widget) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-tv="true"]');
    if (existing) {
      existing.onload = resolve;
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
  currentTicker,
  onSelectTicker,
  isDarkMode = false, // pass from AppShell / context
}) {
  const containerId = useId().replace(/:/g, "-");
  const widgetRef = useRef(null);
  const lastSymbolRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        await loadTradingViewScript();
        if (!alive) return;

        const widget = new window.TradingView.widget({
          container_id: containerId,
          symbol: currentTicker || "AAPL",
          interval: "D",
          autosize: true,
          theme: isDarkMode ? "dark" : "light",
          locale: "en",
          allow_symbol_change: true,
          hide_top_toolbar: false,
          hide_side_toolbar: false,
          withdateranges: true,
          save_image: false,
        });

        widgetRef.current = widget;

        widget.onChartReady(() => {
          const chart = widget.activeChart?.();
          if (!chart) return;

          // Read initial symbol
          try {
            const s = chart.symbol?.();
            if (s?.name) {
              lastSymbolRef.current = s.name;
              onSelectTicker?.(s.name.split(":").pop());
            }
          } catch {}

          // Subscribe to symbol changes (if available)
          try {
            chart.onSymbolChanged().subscribe(null, (s) => {
              const next = s?.name;
              if (!next || next === lastSymbolRef.current) return;
              lastSymbolRef.current = next;
              onSelectTicker?.(next.split(":").pop());
            });
          } catch {
            // Some builds don’t support subscriptions — safe to ignore
          }
        });
      } catch (e) {
        console.error("TradingView failed to load:", e);
      }
    }

    init();

    return () => {
      alive = false;
      try {
        widgetRef.current?.remove?.();
      } catch {}
      widgetRef.current = null;
    };
  }, [containerId, currentTicker, onSelectTicker, isDarkMode]);

  return (
    <section className="panel panel-chart">
      <div className="card-main-chart">
        {/* ✅ ORIGINAL HEADER PRESERVED */}
        <div className="card-header">
          <div className="card-header-left">
            <div className="card-title-row">
              <h2 className="card-title-text">Price action viewer</h2>
              <HelpTooltip title="What is the Price action viewer?">
                <p>
                  This chart shows live market price data powered by TradingView.
                </p>
                <ul>
                  <li>
                    <strong>X-axis:</strong> time (based on selected interval)
                  </li>
                  <li>
                    <strong>Y-axis:</strong> market price
                  </li>
                  <li>
                    Search and switch tickers directly inside the chart.
                  </li>
                </ul>
                <p className="help-popover__note">
                  This is a visualization tool only and is not investment advice.
                </p>
              </HelpTooltip>
            </div>

            <p className="card-subtitle">
              Search any symbol directly in the chart.
            </p>
          </div>

          {/* ❌ DROPDOWN REMOVED — INTENTIONALLY EMPTY */}
          <div className="chart-controls" />
        </div>

        {/* ✅ TRADINGVIEW CHART */}
        <div className="tv-chart-wrapper">
          <div id={containerId} className="tv-chart-inner" />
        </div>
      </div>
    </section>
  );
}
