// frontend/src/components/dashboard/cards/PriceChartPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
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

function randomIdHex(bytesLen = 8) {
  const bytes = new Uint8Array(bytesLen);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const THEME_KEYS = [
  "lucent:theme",
  "lucent:ui_theme",
  "ustock:theme",
  "ustock:ui_theme",
  "theme",
];

function readThemeFromStorage() {
  try {
    for (const k of THEME_KEYS) {
      const raw = String(window.localStorage.getItem(k) || "").trim().toLowerCase();
      if (raw === "dark" || raw === "light") return raw;
      if (raw === "true") return "dark";
      if (raw === "false") return "light";
    }
  } catch {
    // ignore
  }
  return "";
}

function readThemeFromDom() {
  try {
    const el = document.documentElement;
    const dt = String(el?.dataset?.theme || "").trim().toLowerCase();
    if (dt === "dark" || dt === "light") return dt;

    const cls = el?.classList;
    if (cls?.contains("dark")) return "dark";
    if (cls?.contains("light")) return "light";

    const classStr = String(el?.className || "").toLowerCase();
    if (classStr.includes("theme-dark")) return "dark";
    if (classStr.includes("theme-light")) return "light";
  } catch {
    // ignore
  }
  return "";
}

function detectTheme(isDarkMode) {
  const dom = readThemeFromDom();
  if (dom) return dom;

  const stored = readThemeFromStorage();
  if (stored) return stored;

  if (typeof isDarkMode === "boolean") return isDarkMode ? "dark" : "light";

  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) return "dark";
  } catch {
    // ignore
  }

  return "light";
}

export default function PriceChartPanel({
  currentTicker = COPY.fallbacks.symbol,
  isDarkMode,
  activeRangeLabel = "",
  interval = COPY.fallbacks.interval,
}) {
  const [containerId] = useState(() => `tv-${randomIdHex(8)}`);
  const [themeVersion, setThemeVersion] = useState(0);

  const widgetRef = useRef(null);

  const intervalLabel = useMemo(() => prettyTvInterval(interval), [interval]);

  const theme = useMemo(() => {
    return detectTheme(isDarkMode);
  }, [isDarkMode, themeVersion]);

  useEffect(() => {
    const el = document.documentElement;
    if (!el || !window.MutationObserver) return undefined;

    const obs = new MutationObserver(() => {
      setThemeVersion((v) => v + 1);
    });

    obs.observe(el, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await loadTradingViewScript();
        if (!alive) return;

        const symbol = normalizeSymbol(currentTicker) || COPY.fallbacks.symbol;

        const containerEl = document.getElementById(containerId);
        if (containerEl) containerEl.innerHTML = "";
        widgetRef.current = null;

        widgetRef.current = new window.TradingView.widget({
          container_id: containerId,
          symbol,
          interval: String(interval || COPY.fallbacks.interval),
          autosize: true,
          theme,
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
  }, [theme, currentTicker, interval, containerId]);

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
          <div id={containerId} className="tv-chart-inner" />
        </div>
      </div>
    </section>
  );
}