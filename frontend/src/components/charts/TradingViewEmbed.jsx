// src/components/charts/TradingViewEmbed.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureTvScriptLoaded } from "./tradingViewLoader.js";

function randomIdHex(bytesLen = 8) {
  const bytes = new Uint8Array(bytesLen);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function TradingViewEmbed({
  symbol = "NASDAQ:AAPL",
  interval = "D",
  theme = "light",
  height = 420,
  autosize = true,
}) {
  const hostRef = useRef(null);

  const safeHeight = useMemo(() => Math.max(120, Number(height) || 420), [height]);

  // ✅ random per mount, stable, no Math.random during render, no ref access during render
  const [containerId] = useState(() => `tv_container_${randomIdHex(8)}`);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (!hostRef.current) return;

      hostRef.current.innerHTML = `<div id="${containerId}" style="height:100%;width:100%"></div>`;

      try {
        await ensureTvScriptLoaded();
        if (cancelled) return;

        if (!window.TradingView?.widget) {
          throw new Error("TradingView.widget is not available");
        }

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
        if (hostRef.current) {
          hostRef.current.innerHTML =
            `<div style="padding:12px;font-size:12px;opacity:.8">TradingView failed to load.</div>`;
        }
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