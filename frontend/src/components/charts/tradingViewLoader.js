// src/components/charts/tradingViewLoader.js
let tvLoadPromise = null;

export function ensureTvScriptLoaded() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("TradingViewEmbed requires a browser environment"));
  }

  if (window.TradingView) return Promise.resolve(true);
  if (tvLoadPromise) return tvLoadPromise;

  tvLoadPromise = new Promise((resolve, reject) => {
    const src = "https://s3.tradingview.com/tv.js";
    const existing = document.querySelector(`script[src="${src}"]`);

    if (existing) {
      const check = () => {
        if (window.TradingView) resolve(true);
        else setTimeout(check, 50);
      };
      check();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load TradingView tv.js"));

    document.head.appendChild(script);
  });

  return tvLoadPromise;
}