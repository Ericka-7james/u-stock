// frontend/src/components/dashboard/cards/BotControlCard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import "../../../css/dashboard/cards/BotControlCard.css";

async function apiGet(url) {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

function fmtTime(epoch) {
  const t = Number(epoch);
  if (!Number.isFinite(t) || t <= 0) return "—";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

function pillTone(state) {
  if (state === "running") return "pos";
  if (state === "paused") return "warn";
  return "neg";
}

function safeStr(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

/**
 * BotControlCard
 *
 * Status truth source:
 * - /api/bots/status?bot_id=...
 * UI "paused" overlay:
 * - /api/market/us/session (if market closed AND bot is configured/running, show PAUSED)
 */
export default function BotControlCard({
  activeBotId,
  onActiveBotChange,

  // NEW preferred callback name used by TradePerformancePanel
  onStateChange,

  // Back-compat (older parent prop name)
  onBotStateChange,
}) {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState(activeBotId || "ema_trend");

  const [status, setStatus] = useState(null);
  const [market, setMarket] = useState(null);

  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState("");

  const statusTimerRef = useRef(null);
  const marketTimerRef = useRef(null);

  const selectedMeta = useMemo(() => {
    return available.find((b) => b.id === selected) || null;
  }, [available, selected]);

  // --------- fetch available bots ---------
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await apiGet("/api/bots/available");
        if (!mounted) return;

        const bots = Array.isArray(data?.bots) ? data.bots : [];
        setAvailable(bots);

        // Prefer parent-provided activeBotId; else first available; else ema_trend.
        const fallback = activeBotId || bots?.[0]?.id || "ema_trend";
        setSelected(fallback);
      } catch (e) {
        if (!mounted) return;
        setUiError(String(e?.message || e));
      }
    })();

    return () => {
      mounted = false;
    };
  }, [activeBotId]);

  // --------- market session polling (for "PAUSED when market closed") ---------
  async function refreshMarketSession() {
    try {
      const data = await apiGet("/api/market/us/session");
      setMarket(data);
    } catch {
      // Don’t fail the card if session endpoint flakes; just keep prior.
    }
  }

  // --------- status polling ---------
  async function refreshStatus(botId = selected) {
    const id = safeStr(botId);
    if (!id) return;

    const data = await apiGet(`/api/bots/status?bot_id=${encodeURIComponent(id)}`);
    setStatus(data);

    // Emit to parent(s)
    onStateChange?.(data);
    onBotStateChange?.(data);
  }

  // Start timers on selected change
  useEffect(() => {
    if (!selected) return;

    setUiError("");

    // immediate refresh
    refreshStatus(selected);
    refreshMarketSession();

    // clear old timers
    if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    if (marketTimerRef.current) clearInterval(marketTimerRef.current);

    // status every 5s
    statusTimerRef.current = setInterval(() => refreshStatus(selected), 5000);

    // market session every 30s (lighter)
    marketTimerRef.current = setInterval(() => refreshMarketSession(), 30000);

    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
      if (marketTimerRef.current) clearInterval(marketTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function onSelect(e) {
    const id = e.target.value;
    setSelected(id);
    onActiveBotChange?.(id);
  }

  async function start() {
    setUiError("");
    setBusy(true);
    try {
      await apiPost("/api/bots/start", { bot_id: selected, mode: "paper" });
      await refreshStatus(selected);
      await refreshMarketSession();
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setUiError("");
    setBusy(true);
    try {
      await apiPost(`/api/bots/stop?bot_id=${encodeURIComponent(selected)}`);
      await refreshStatus(selected);
      await refreshMarketSession();
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // --------- derive UI state ---------
  const rawState = safeStr(status?.state, "stopped"); // running | paused | stopped
  const mode = safeStr(status?.mode, "paper");

  const backendRunning = rawState === "running";
  const backendPaused = rawState === "paused";

  // Market session interpretation
  const marketOk = market && typeof market === "object" && market.ok === true;
  const isOpen = marketOk ? Boolean(market.is_open) : null;
  const nextOpenEpoch =
    Number.isFinite(Number(status?.nextOpenEpoch)) && Number(status?.nextOpenEpoch) > 0
      ? Number(status?.nextOpenEpoch)
      : Number.isFinite(Number(market?.next_open)) && Number(market?.next_open) > 0
      ? Number(market?.next_open)
      : null;

  // ✅ UI overlay: if market is closed and bot is configured/running, show PAUSED even if backend says running
  const uiPausedBecauseMarket = isOpen === false && backendRunning;
  const uiPaused = backendPaused || uiPausedBecauseMarket;

  const uiState = uiPaused ? "paused" : backendRunning ? "running" : "stopped";

  const statusDetail = uiPaused
    ? safeStr(status?.pausedReason, isOpen === false ? "Market closed" : "Paused")
    : backendRunning
    ? "Running"
    : "Stopped";

  return (
    <div className="botCard">
      <div className="botCardHead">
        <div className="botCardTitleRow">
          <div className="botCardTitle">Bot Control</div>

          <HelpTooltip
            text={
              "Select a bot, then Start/Stop. If the market is closed, the bot will show PAUSED (configured but gated)."
            }
          />
        </div>

        <div className={`botCardStatePill ${pillTone(uiState)}`}>
          {uiState === "paused" ? "PAUSED" : uiState === "running" ? "LIVE" : "OFF"}
        </div>
      </div>

      <div className="botCardBody">
        <div className="botCardTopRow">
          <div className="botSelectWrap">
            <label className="botLabel">Bot</label>

            <select className="botSelect" value={selected} onChange={onSelect} disabled={busy}>
              {(available.length ? available : [{ id: "ema_trend", name: "EMA Trend Bot" }]).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || b.id}
                </option>
              ))}
            </select>

            <div className="botHint">{selectedMeta?.description || ""}</div>
          </div>

          <div className="botActions">
            {uiState === "running" || uiState === "paused" ? (
              <button className="botBtn stop" type="button" onClick={stop} disabled={busy}>
                Stop
              </button>
            ) : (
              <button className="botBtn start" type="button" onClick={start} disabled={busy}>
                Start
              </button>
            )}
          </div>
        </div>

        <div className="botGrid">
          <div className="botTile">
            <div className="botTileLabel">Mode</div>
            <div className="botTileValue">{mode}</div>
          </div>

          <div className="botTile">
            <div className="botTileLabel">Last run</div>
            <div className="botTileValue">{status?.lastRun ? fmtTime(status.lastRun) : "—"}</div>
          </div>

          <div className="botTile">
            <div className="botTileLabel">Last intents</div>
            <div className="botTileValue">
              {Number.isFinite(Number(status?.lastIntents)) ? String(status.lastIntents) : "—"}
            </div>
          </div>

          <div className="botTile">
            <div className="botTileLabel">Status detail</div>
            <div className="botTileValue">
              {uiState === "paused" ? (
                <>
                  <div className="botPausedLine">{statusDetail}</div>
                  <div className="botPausedSub">
                    Next open: {nextOpenEpoch ? fmtTime(nextOpenEpoch) : "—"}
                  </div>
                </>
              ) : (
                <span>{statusDetail}</span>
              )}
            </div>
          </div>
        </div>

        {uiError ? <div className="botError">{uiError}</div> : null}
        {status?.lastError ? <div className="botError subtle">Last error: {String(status.lastError)}</div> : null}
      </div>
    </div>
  );
}
