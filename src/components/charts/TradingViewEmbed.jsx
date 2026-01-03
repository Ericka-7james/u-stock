// src/components/charts/TradingViewEmbed.jsx
import { useEffect, useMemo, useRef } from "react";

function ensureTvScriptLoaded() {
  // Load tv.js once
  if (window.__TV_JS_LOADING__) return window.__TV_JS_LOADING__;
  if (window.TradingView) return Promise.resolve(true);

  window.__TV_JS_LOADING__ = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
    if (existing) {
      // If script exists but TradingView isn't ready yet, wait a tick
      const check = () => {
        if (window.TradingView) resolve(true);
        else setTimeout(check, 50);
      };
      check();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;

    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load TradingView tv.js"));

    document.head.appendChild(script);
  });

  return window.__TV_JS_LOADING__;
}

export default function TradingViewEmbed({
  symbol = "NASDAQ:AAPL",
  interval = "D",
  theme = "light",
  height = 420,
  autosize = true,
}) {
  const hostRef = useRef(null);

  // Unique container id per component instance
  const containerId = useMemo(() => {
    const rand = Math.random().toString(36).slice(2);
    return `tv_container_${rand}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (!hostRef.current) return;

      // Clear previous widget DOM
      hostRef.current.innerHTML = `<div id="${containerId}" style="height:100%;width:100%"></div>`;

      try {
        await ensureTvScriptLoaded();
        if (cancelled) return;

        // eslint-disable-next-line no-undef
        new TradingView.widget({
          autosize,
          symbol,
          interval,
          timezone: "Etc/UTC",
          theme,
          style: "1",
          locale: "en",
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          container_id: containerId,
        });
      } catch (e) {
        if (cancelled) return;
        // Fallback message
        hostRef.current.innerHTML = `<div style="padding:12px;font-size:12px;opacity:.8">TradingView failed to load.</div>`;
      }
    }

    mount();
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, theme, autosize, containerId]);

  return <div ref={hostRef} style={{ height, width: "100%" }} />;
}
