// src/components/dashboard/cards/PriceChartPanel.jsx
import { useEffect, useRef } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";
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

function normalizeSymbol(sym) {
  const s = String(sym || "").trim();
  if (!s) return "";
  const last = s.includes(":") ? s.split(":").pop() : s;
  return last.toUpperCase();
}

export default function PriceChartPanel({ currentTicker = "AAPL", isDarkMode = false }) {
  const containerIdRef = useRef(`tv-${Math.random().toString(16).slice(2)}`);
  const widgetRef = useRef(null);

  // Create / recreate on theme changes.
  // (We DO NOT recreate on ticker changes; the embed owns symbol search anyway.)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await loadTradingViewScript();
        if (!alive) return;

        // 🔥 Hard cleanup: wipe container + remove old widget reference
        const containerEl = document.getElementById(containerIdRef.current);
        if (containerEl) containerEl.innerHTML = "";
        widgetRef.current = null;

        // Recreate with new theme
        widgetRef.current = new window.TradingView.widget({
          container_id: containerIdRef.current,
          symbol: normalizeSymbol(currentTicker) || "AAPL",
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
      } catch (e) {
        console.error("TradingView init failed:", e);
      }
    })();

    return () => {
      alive = false;
    };
    // ✅ only theme changes trigger rebuild
  }, [isDarkMode]);

  return (
    <section className="panel panel-chart">
      <div className="card-main-chart">
        <div className="card-header">
          <div className="card-header-left">
            <div className="card-title-row">
              <h2 className="card-title-text">Price action viewer</h2>
              <HelpTooltip title="What is the Price action viewer?">
                <p>This chart is powered by TradingView.</p>
                <p className="help-popover__note">
                  Theme updates require recreating the free embed.
                </p>
              </HelpTooltip>
            </div>
            <p className="card-subtitle">Search any symbol directly in the chart.</p>
          </div>
        </div>

        <div className="tv-chart-wrapper">
          <div id={containerIdRef.current} className="tv-chart-inner" />
        </div>
      </div>
    </section>
  );
}
