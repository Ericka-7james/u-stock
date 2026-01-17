// src/components/charts/TradingViewEmbed.jsx
import { useEffect, useMemo, useRef } from "react";

const TV_SRC = "https://s3.tradingview.com/tv.js";
let tvLoadPromise = null;

// ✅ exported for test + debugging (safe in prod too)
export function __resetTvLoaderForTests() {
  tvLoadPromise = null;
}

export function ensureTvScriptLoaded() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("TradingViewEmbed requires a browser environment"));
  }

  if (window.TradingView) return Promise.resolve(true);
  if (tvLoadPromise) return tvLoadPromise;

  tvLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TV_SRC}"]`);
    if (existing) {
      const check = () => {
        if (window.TradingView) resolve(true);
        else setTimeout(check, 50);
      };
      check();
      return;
    }

    const script = document.createElement("script");
    script.src = TV_SRC;
    script.async = true;

    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load TradingView tv.js"));

    document.head.appendChild(script);
  });

  return tvLoadPromise;
}

export default function TradingViewEmbed({
  symbol = "NASDAQ:AAPL",
  interval = "D",
  theme = "light",
  height = 420,
  autosize = true,
}) {
  const hostRef = useRef(null);

  const safeHeight = Math.max(120, Number(height) || 420);

  const containerId = useMemo(() => {
    const rand = Math.random().toString(36).slice(2);
    return `tv_container_${rand}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (!hostRef.current) return;

      hostRef.current.innerHTML = `<div id="${containerId}" style="height:100%;width:100%"></div>`;

      try {
        await ensureTvScriptLoaded();
        if (cancelled) return;

        if (!window.TradingView?.widget) throw new Error("TradingView.widget is not available");

        // eslint-disable-next-line no-new
        new window.TradingView.widget({
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
      } catch {
        if (cancelled) return;
        hostRef.current.innerHTML =
          `<div style="padding:12px;font-size:12px;opacity:.8">TradingView failed to load.</div>`;
      }
    }

    mount();

    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [symbol, interval, theme, autosize, containerId]);

  return <div ref={hostRef} style={{ height: safeHeight, width: "100%" }} />;
}
