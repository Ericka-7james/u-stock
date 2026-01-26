// frontend/src/components/dashboard/cards/BotControlCard.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import Modal from "../../common/Modal.jsx";
import "../../../css/dashboard/cards/BotControlCard.css";

/**
 * Fetch helpers (cookies included).
 */
async function apiGet(url, { signal } = {}) {
  const res = await fetch(url, { credentials: "include", signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

async function apiPost(url, body, { signal } = {}) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

function safeStr(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

function fmtAge(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
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

function pillTone(uiState) {
  if (uiState === "running") return "pos";
  if (uiState === "paused") return "warn";
  return "neg";
}

export default function BotControlCard({ activeBotId, onActiveBotChange }) {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState(activeBotId || "ema_trend");

  const [market, setMarket] = useState(null);
  const [config, setConfig] = useState(null);

  // live status from backend /api/bots/status
  const [status, setStatus] = useState(null);

  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState("");

  // Modals
  const [cfgOpen, setCfgOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  // Start confirmation + arming
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const ARM_WINDOW_MS = 15_000;
  const [armedUntil, setArmedUntil] = useState(0);
  const isArmed = armedUntil > Date.now();

  const [cfgDraft, setCfgDraft] = useState({
    mode: "paper",
    risk_per_trade: 0.005,
    max_trades_per_day: 3,
    min_confidence: 0.62,
  });

  const [logItems, setLogItems] = useState([]);
  const [logBusy, setLogBusy] = useState(false);
  const [logErr, setLogErr] = useState("");

  const aliveRef = useRef(true);
  const inflightRef = useRef({
    available: null,
    market: null,
    config: null,
    status: null,
    action: null,
    log: null,
  });

  // timers: use timeout for status (self-scheduling poll), interval for market, interval for arm tick
  const timersRef = useRef({
    market: null,
    status: null, // timeout id
    armTick: null,
  });

  function abortInflight(key) {
    const cur = inflightRef.current?.[key];
    if (cur) cur.abort();
    inflightRef.current[key] = null;
  }

  // robust cleanup for both interval + timeout
  function clearTimer(t) {
    if (!t) return;
    clearInterval(t);
    clearTimeout(t);
  }

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;

      Object.keys(inflightRef.current || {}).forEach((k) => abortInflight(k));
      Object.values(timersRef.current || {}).forEach((t) => clearTimer(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selected in sync with parent
  useEffect(() => {
    if (!activeBotId) return;
    setSelected(activeBotId);
    setArmedUntil(0);
    setStartConfirmOpen(false);
  }, [activeBotId]);

  const selectedMeta = useMemo(
    () => available.find((b) => b.id === selected) || null,
    [available, selected]
  );

  // -------- load available bots ----------
  useEffect(() => {
    abortInflight("available");
    const ac = new AbortController();
    inflightRef.current.available = ac;

    (async () => {
      try {
        const data = await apiGet("/api/bots/available", { signal: ac.signal });
        if (!aliveRef.current || ac.signal.aborted) return;

        const bots = Array.isArray(data?.bots) ? data.bots : [];
        setAvailable(bots);

        const fallback = activeBotId || bots?.[0]?.id || "ema_trend";
        setSelected((prev) => prev || fallback);
      } catch (e) {
        if (!aliveRef.current || ac.signal.aborted) return;
        setUiError(String(e?.message || e));
      } finally {
        if (inflightRef.current.available === ac) inflightRef.current.available = null;
      }
    })();

    return () => ac.abort();
  }, [activeBotId]);

  // -------- market session ----------
  const refreshMarketSession = useCallback(async () => {
    // market requests can be safely aborted because they are slow + infrequent
    abortInflight("market");
    const ac = new AbortController();
    inflightRef.current.market = ac;

    try {
      const data = await apiGet("/api/market/us/session", { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;
      setMarket(data);
    } catch {
      // ignore
    } finally {
      if (inflightRef.current.market === ac) inflightRef.current.market = null;
    }
  }, []);

  // -------- config ----------
  const refreshConfig = useCallback(async (botId = selected) => {
    const id = safeStr(botId);
    if (!id) return;

    abortInflight("config");
    const ac = new AbortController();
    inflightRef.current.config = ac;

    try {
      const data = await apiGet(`/api/bots/config?bot_id=${encodeURIComponent(id)}`, {
        signal: ac.signal,
      });
      if (!aliveRef.current || ac.signal.aborted) return;

      const cfg = data?.config && typeof data.config === "object" ? data.config : null;
      setConfig(cfg);

      if (cfg) {
        setCfgDraft({
          mode: safeStr(cfg.mode, "paper"),
          risk_per_trade: n(cfg.risk_per_trade, 0.005),
          max_trades_per_day: Math.max(1, Math.floor(n(cfg.max_trades_per_day, 3))),
          min_confidence: Math.min(0.99, Math.max(0.0, n(cfg.min_confidence, 0.62))),
        });
      }
    } catch {
      // ignore
    } finally {
      if (inflightRef.current.config === ac) inflightRef.current.config = null;
    }
  }, [selected]);

  // -------- status polling (NO abort spam) ----------
  const refreshStatus = useCallback(async (botId = selected) => {
    const id = safeStr(botId);
    if (!id) return;

    // ✅ never overlap status requests
    if (inflightRef.current.status) return;

    const ac = new AbortController();
    inflightRef.current.status = ac;

    try {
      const data = await apiGet(`/api/bots/status?bot_id=${encodeURIComponent(id)}`, {
        signal: ac.signal,
      });
      if (!aliveRef.current || ac.signal.aborted) return;
      setStatus(data);
    } catch {
      // ignore
    } finally {
      // IMPORTANT: only clear if it is still the same controller
      if (inflightRef.current.status === ac) inflightRef.current.status = null;
    }
  }, [selected]);

  // Start timers on selected change
  useEffect(() => {
    if (!selected) return;

    setUiError("");

    // initial loads
    refreshMarketSession();
    refreshConfig(selected);
    refreshStatus(selected);

    // market interval (cheap)
    if (timersRef.current.market) clearTimer(timersRef.current.market);
    timersRef.current.market = setInterval(() => {
      refreshMarketSession();
    }, 30_000);

    // ✅ status self-scheduling poll (prevents overlap + avoids canceled spam)
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      await refreshStatus(selected);
      if (stopped) return;
      timersRef.current.status = setTimeout(poll, 1500);
    };

    if (timersRef.current.status) clearTimer(timersRef.current.status);
    poll();

    return () => {
      stopped = true;
      if (timersRef.current.market) clearTimer(timersRef.current.market);
      if (timersRef.current.status) clearTimer(timersRef.current.status);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, refreshMarketSession, refreshConfig, refreshStatus]);

  // Arm countdown tick (renders countdown)
  useEffect(() => {
    if (!isArmed) return;
    if (timersRef.current.armTick) clearInterval(timersRef.current.armTick);
    timersRef.current.armTick = setInterval(() => setArmedUntil((v) => v), 250);
    return () => timersRef.current.armTick && clearInterval(timersRef.current.armTick);
  }, [isArmed]);

  function armNow() {
    setArmedUntil(Date.now() + ARM_WINDOW_MS);
  }
  function disarm() {
    setArmedUntil(0);
  }

  const armRemainingSec = useMemo(() => {
    if (!isArmed) return 0;
    return Math.max(0, Math.ceil((armedUntil - Date.now()) / 1000));
  }, [armedUntil, isArmed]);

  function onSelect(e) {
    const id = e.target.value;
    setSelected(id);
    onActiveBotChange?.(id);
    disarm();
    setStartConfirmOpen(false);
  }

  // -------- start/pause actions ----------
  async function doStart() {
    setUiError("");
    setBusy(true);
    try {
      await apiPost("/api/bots/start", { bot_id: selected, mode: safeStr(cfgDraft.mode, "paper") });
      await refreshStatus(selected);
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  // NOTE: backend endpoint is /stop but it represents "pause intent" in your system
  async function doPause() {
    setUiError("");
    setBusy(true);
    try {
      await apiPost("/api/bots/stop", { bot_id: selected, paused_reason: "manual_pause" });
      await refreshStatus(selected);
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  // -------- derive UI state from bots.py shape (production-ready) ----------
  const intent = safeStr(status?.intent, "paused").toLowerCase(); // running | paused
  const effective = safeStr(status?.effective_state, "stopped").toLowerCase(); // starting|running|paused|offline|...
  const reasonCode = safeStr(status?.reason_code, "").toLowerCase(); // kept for future use
  const backendMsg = safeStr(status?.message, "");
  const pausedReason = safeStr(status?.pausedReason, "");
  const lastError = safeStr(status?.lastError, "");

  const mode = safeStr(status?.mode, safeStr(config?.mode, "paper"));

  // market
  const marketOk = market && typeof market === "object" && market.ok === true;
  const isOpen = marketOk ? Boolean(market.is_open) : null;

  // next open (prefer backend-calculated nextOpenEpoch, else market next_open)
  const nextOpenEpochRaw =
    Number.isFinite(Number(status?.nextOpenEpoch)) && Number(status?.nextOpenEpoch) > 0
      ? Number(status?.nextOpenEpoch)
      : Number.isFinite(Number(market?.next_open)) && Number(market?.next_open) > 0
      ? Number(market?.next_open)
      : null;

  // heartbeat age (only meaningful when intent is running)
  const hbAge = Number.isFinite(Number(status?.heartbeatAgeSec)) ? Number(status.heartbeatAgeSec) : null;
  const hbAt = Number.isFinite(Number(status?.heartbeatAt)) ? Number(status.heartbeatAt) : 0; // kept for future use

  // classify effective state
  const isError = effective === "error" || Boolean(lastError);
  const isOffline = effective === "offline";
  const isPausedEff = effective === "paused";
  const isWaiting = effective === "waiting_for_market";
  const isStarting = effective === "starting";
  const isRunningEff = effective === "running";
  const isDegraded = effective === "degraded";

  // "live-ish" includes starting/waiting/degraded
  const liveish = isStarting || isRunningEff || isWaiting || isDegraded;

  // UI State rules:
  // - offline/error shows PAUSED (needs attention)
  // - paused shows PAUSED
  // - starting/running/degraded show LIVE
  // - waiting_for_market shows PAUSED (not trading) but detail clarifies
  let uiState = "stopped";
  if (isError || isOffline || isPausedEff || isWaiting) uiState = "paused";
  else if (liveish) uiState = "running";
  else uiState = "stopped";

  const isRunningUi = uiState === "running";

  // Show "Next open" only when waiting/market-closed context makes sense
  const showNextOpen =
    (effective === "waiting_for_market" || (intent === "running" && isOpen === false) || effective === "paused") &&
    Boolean(nextOpenEpochRaw);

  // Build a status detail line
  let statusDetail = "Idle";

  if (isError) {
    statusDetail = lastError ? `Error: ${lastError}` : "Error";
  } else if (isOffline) {
    statusDetail =
      hbAge != null ? `Offline (no heartbeat · ${fmtAge(hbAge)} ago)` : "Offline (runner not heartbeating)";
  } else if (isPausedEff) {
    statusDetail = pausedReason || backendMsg || "Paused";
  } else if (isWaiting) {
    statusDetail = isOpen === false ? "Waiting for market open" : backendMsg || "Waiting for market";
  } else if (isStarting) {
    statusDetail = backendMsg || "Starting…";
  } else if (isDegraded) {
    statusDetail = backendMsg ? `Degraded: ${backendMsg}` : "Degraded (running)";
  } else if (isRunningEff) {
    statusDetail = isOpen === false ? "Running (market closed)" : backendMsg || "Running";
  } else {
    statusDetail = backendMsg || "Idle";
  }

  // gating
  const canArm = !busy && !isRunningUi;
  const canStart = !busy && !isRunningUi && isArmed;
  const canPause = !busy && isRunningUi;

  function requestStart() {
    setUiError("");
    if (!canStart) return;
    setStartConfirmOpen(true);
  }

  async function confirmStart() {
    setStartConfirmOpen(false);
    disarm();
    await doStart();
  }

  // -------- log ----------
  async function openLog() {
    setLogErr("");
    setLogItems([]);
    setLogOpen(true);
    setLogBusy(true);

    abortInflight("log");
    const ac = new AbortController();
    inflightRef.current.log = ac;

    try {
      const data = await apiGet(`/api/bots/log?bot_id=${encodeURIComponent(selected)}&limit=120`, {
        signal: ac.signal,
      });
      if (!aliveRef.current || ac.signal.aborted) return;

      const items = Array.isArray(data?.items) ? data.items : [];
      setLogItems(items.reverse());
    } catch (e) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setLogErr(String(e?.message || e));
    } finally {
      if (inflightRef.current.log === ac) inflightRef.current.log = null;
      if (aliveRef.current) setLogBusy(false);
    }
  }

  async function saveConfig() {
    setUiError("");
    setBusy(true);

    abortInflight("action");
    const ac = new AbortController();
    inflightRef.current.action = ac;

    try {
      const payload = {
        bot_id: selected,
        config: {
          mode: safeStr(cfgDraft.mode, "paper"),
          risk_per_trade: n(cfgDraft.risk_per_trade, 0.005),
          max_trades_per_day: Math.max(1, Math.floor(n(cfgDraft.max_trades_per_day, 3))),
          min_confidence: Math.min(0.99, Math.max(0.0, n(cfgDraft.min_confidence, 0.62))),
        },
      };

      await apiPost("/api/bots/config", payload, { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;

      await refreshConfig(selected);
      setCfgOpen(false);
    } catch (e) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setUiError(String(e?.message || e));
    } finally {
      if (inflightRef.current.action === ac) inflightRef.current.action = null;
      if (aliveRef.current) setBusy(false);
    }
  }

  const cfgSummary = config
    ? `Mode ${safeStr(config.mode, "paper")} · Risk ${(n(config.risk_per_trade, 0) * 100).toFixed(
        2
      )}% · Max ${Math.floor(n(config.max_trades_per_day, 0))}/day · Min conf ${n(
        config.min_confidence,
        0
      ).toFixed(2)}`
    : "Not loaded yet";

  return (
    <>
      <div className="botCard">
        <div className="botCardHead">
          <div className="botCardTitleRow">
            <div className="botCardTitle">Bot Control</div>
            <HelpTooltip text="Arm, then Start with confirmation. Use Pause to halt trading. Risk Controls tune behavior. Logs show runner + bot messages." />
          </div>

          <div className="botPillRow">
            <div
              className={`botCardStatePill ${isArmed ? "warn" : "neg"}`}
              title={isArmed ? "Start is enabled briefly." : "Arm to enable Start."}
            >
              {isArmed ? `ARMED · ${armRemainingSec}s` : "DISARMED"}
            </div>

            <div className={`botCardStatePill status ${pillTone(uiState)}`}>
              {uiState === "paused" ? "PAUSED" : uiState === "running" ? "LIVE" : "IDLE"}
            </div>
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
              <button className="botBtn" type="button" onClick={() => setCfgOpen(true)} disabled={busy}>
                Risk Controls
              </button>

              <button className="botBtn" type="button" onClick={openLog} disabled={busy}>
                View log
              </button>

              {/* Arm/Disarm only when not LIVE */}
              {!isRunningUi ? (
                <button
                  className="botBtn"
                  type="button"
                  onClick={isArmed ? disarm : armNow}
                  disabled={!canArm}
                  title={canArm ? "Arm to enable Start briefly." : "Disabled"}
                >
                  {isArmed ? "Disarm" : "Arm"}
                </button>
              ) : null}

              {/* Primary action: Start (when not LIVE) or Pause (when LIVE). No Stop button. */}
              {isRunningUi ? (
                <button className="botBtn stop" type="button" onClick={doPause} disabled={!canPause}>
                  Pause
                </button>
              ) : (
                <button
                  className="botBtn start"
                  type="button"
                  onClick={requestStart}
                  disabled={!canStart}
                  title={!isArmed ? "Arm first, then Start." : "Start bot"}
                >
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
                      Next open: {showNextOpen && nextOpenEpochRaw ? fmtTime(nextOpenEpochRaw) : "—"}
                    </div>
                  </>
                ) : (
                  <span>{statusDetail}</span>
                )}
              </div>
            </div>

            <div className="botTile" style={{ gridColumn: "1 / -1" }}>
              <div className="botTileLabel" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>Mode + Risk Controls</span>
                <button className="botLinkBtn" type="button" onClick={() => setCfgOpen(true)} disabled={busy}>
                  Edit
                </button>
              </div>
              <div className="botTileValue">{cfgSummary}</div>
            </div>
          </div>

          {uiError ? <div className="botError">{uiError}</div> : null}
          {status?.lastError ? <div className="botError subtle">Last error: {String(status.lastError)}</div> : null}
        </div>
      </div>

      {/* Start confirmation */}
      <Modal
        open={startConfirmOpen}
        title="Start this bot?"
        onClose={() => setStartConfirmOpen(false)}
        footer={
          <>
            <button className="mBtn" type="button" onClick={() => setStartConfirmOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="mBtn mBtnPrimary" type="button" onClick={confirmStart} disabled={busy}>
              Confirm start
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>
            You’re about to start: <span className="mMono">{selected}</span>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
            Mode: <span className="mMono">{safeStr(cfgDraft.mode, "paper")}</span>
            {" · "}
            Risk/trade: <span className="mMono">{(n(cfgDraft.risk_per_trade, 0.005) * 100).toFixed(2)}%</span>
            {" · "}
            Max/day: <span className="mMono">{Math.floor(n(cfgDraft.max_trades_per_day, 3))}</span>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
            Confirm to start. Use Pause anytime to halt trading.
          </div>
        </div>
      </Modal>

      {/* Config modal */}
      <Modal
        open={cfgOpen}
        title="Mode + Risk Controls"
        onClose={() => setCfgOpen(false)}
        footer={
          <>
            <button className="mBtn" type="button" onClick={() => setCfgOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="mBtn mBtnPrimary" type="button" onClick={saveConfig} disabled={busy}>
              Save
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>Mode</div>
            <select
              className="botSelect"
              value={cfgDraft.mode}
              onChange={(e) => setCfgDraft((s) => ({ ...s, mode: e.target.value }))}
              disabled={busy}
            >
              <option value="paper">paper</option>
              <option value="live">live</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>Risk per trade (fraction)</div>
            <input
              className="botInput"
              type="number"
              step="0.001"
              min="0"
              max="0.05"
              value={cfgDraft.risk_per_trade}
              onChange={(e) => setCfgDraft((s) => ({ ...s, risk_per_trade: e.target.value }))}
              disabled={busy}
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>Example: 0.005 = 0.5% risk per trade</div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>Max trades per day</div>
            <input
              className="botInput"
              type="number"
              step="1"
              min="1"
              max="50"
              value={cfgDraft.max_trades_per_day}
              onChange={(e) => setCfgDraft((s) => ({ ...s, max_trades_per_day: e.target.value }))}
              disabled={busy}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>Min confidence</div>
            <input
              className="botInput"
              type="number"
              step="0.01"
              min="0"
              max="0.99"
              value={cfgDraft.min_confidence}
              onChange={(e) => setCfgDraft((s) => ({ ...s, min_confidence: e.target.value }))}
              disabled={busy}
            />
          </div>
        </div>
      </Modal>

      {/* Log modal */}
      <Modal
        open={logOpen}
        title={`Bot log · ${selected}`}
        onClose={() => setLogOpen(false)}
        footer={
          <button className="mBtn" type="button" onClick={() => setLogOpen(false)}>
            Close
          </button>
        }
      >
        {logErr ? <div className="botError">{logErr}</div> : null}

        {logBusy ? (
          <div style={{ opacity: 0.75, fontWeight: 800 }}>Loading log…</div>
        ) : logItems.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {logItems.map((r, idx) => (
              <div
                key={`${idx}-${r.ts}`}
                style={{
                  border: "1px solid rgba(148,163,184,0.22)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "rgba(248,250,252,0.65)",
                }}
              >
                <div className="mMono" style={{ fontWeight: 900, fontSize: 12 }}>
                  {fmtTime(r.ts)} · {String(r.level || "info").toUpperCase()}
                </div>
                <div style={{ marginTop: 4, fontWeight: 800 }}>{String(r.message || "")}</div>
                {r.meta ? (
                  <pre className="mMono" style={{ marginTop: 8, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(r.meta, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontWeight: 800 }}>No log entries yet.</div>
        )}
      </Modal>
    </>
  );
}
