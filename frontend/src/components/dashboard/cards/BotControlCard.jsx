// frontend/src/components/dashboard/cards/BotControlCard.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function fmtTime(epochSec) {
  const t = Number(epochSec);
  if (!Number.isFinite(t) || t <= 0) return "—";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "—";
  }
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

function pillTone(kind) {
  if (kind === "pos") return "pos";
  if (kind === "warn") return "warn";
  return "neg";
}

function normalizeEff(x) {
  const v = String(x || "").trim().toLowerCase();
  const ok = new Set([
    "running",
    "waiting_for_market",
    "starting",
    "paused",
    "stopped",
    "offline",
    "error",
    "degraded",
    "idle",
    "armed",
    "disarmed",
  ]);
  return ok.has(v) ? v : v || "stopped";
}

function normalizeIntent(x) {
  const v = String(x || "").trim().toLowerCase();
  return v || "";
}

export default function BotControlCard({ activeBotId, onActiveBotChange, onStartBot, onStopBot }) {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState(activeBotId || "ema_trend");

  const [status, setStatus] = useState(null);
  const [market, setMarket] = useState(null);
  const [config, setConfig] = useState(null);

  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState("");

  // confirm start
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);

  // View log modal
  const [logOpen, setLogOpen] = useState(false);
  const [logItems, setLogItems] = useState([]);
  const [logBusy, setLogBusy] = useState(false);

  // Risk Controls modal
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskBusy, setRiskBusy] = useState(false);
  const [riskDraft, setRiskDraft] = useState({
    risk_per_trade: "",
    max_trades_per_day: "",
    min_confidence: "",
  });

  // arm
  const ARM_WINDOW_MS = 15_000;
  const [armedUntil, setArmedUntil] = useState(0);
  const isArmed = armedUntil > Date.now();

  // mode (paper-only for now)
  const [mode, setMode] = useState("paper");

  const aliveRef = useRef(true);
  const inflightRef = useRef({ available: null, status: null, market: null, config: null, action: null });
  const timersRef = useRef({ status: null, market: null, armTick: null });

  function abortInflight(key) {
    const cur = inflightRef.current?.[key];
    if (cur) cur.abort();
    inflightRef.current[key] = null;
  }

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

  // sync selected with parent
  useEffect(() => {
    if (!activeBotId) return;
    setSelected(activeBotId);
    setArmedUntil(0);
    setStartConfirmOpen(false);
  }, [activeBotId]);

  // load bots list
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

  const refreshMarket = useCallback(async () => {
    if (inflightRef.current.market) return;
    const ac = new AbortController();
    inflightRef.current.market = ac;

    try {
      const data = await apiGet("/api/market/us/session", { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;
      setMarket(data);
    } catch {
      // fail-open
    } finally {
      if (inflightRef.current.market === ac) inflightRef.current.market = null;
    }
  }, []);

  const refreshConfig = useCallback(async (botId) => {
    const id = safeStr(botId);
    if (!id || inflightRef.current.config) return;

    const ac = new AbortController();
    inflightRef.current.config = ac;

    try {
      const data = await apiGet(`/api/bots/config?bot_id=${encodeURIComponent(id)}`, { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;

      const cfg = data?.config && typeof data.config === "object" ? data.config : null;
      setConfig(cfg);

      const m = safeStr(cfg?.mode, "paper");
      setMode(m === "live" ? "paper" : m);

      // seed risk draft for modal
      setRiskDraft({
        risk_per_trade: cfg?.risk_per_trade ?? "",
        max_trades_per_day: cfg?.max_trades_per_day ?? "",
        min_confidence: cfg?.min_confidence ?? "",
      });
    } catch {
      // ignore
    } finally {
      if (inflightRef.current.config === ac) inflightRef.current.config = null;
    }
  }, []);

  const refreshStatus = useCallback(
    async (botId) => {
      const id = safeStr(botId);
      if (!id || inflightRef.current.status) return;

      const ac = new AbortController();
      inflightRef.current.status = ac;

      try {
        const data = await apiGet(`/api/bots/status?bot_id=${encodeURIComponent(id)}`, { signal: ac.signal });
        if (!aliveRef.current || ac.signal.aborted) return;
        setStatus(data);

        // prefer backend mode when present
        const m = safeStr(data?.mode, safeStr(config?.mode, mode));
        setMode(m === "live" ? "paper" : m);
      } catch {
        // ignore
      } finally {
        if (inflightRef.current.status === ac) inflightRef.current.status = null;
      }
    },
    [config?.mode, mode]
  );

  // polling on selected
  useEffect(() => {
    if (!selected) return;
    setUiError("");

    refreshConfig(selected);
    refreshStatus(selected);
    refreshMarket();

    clearTimer(timersRef.current.market);
    timersRef.current.market = setInterval(() => refreshMarket(), 30_000);

    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      await refreshStatus(selected);
      if (stopped) return;
      timersRef.current.status = setTimeout(poll, 1500);
    };
    clearTimer(timersRef.current.status);
    poll();

    return () => {
      stopped = true;
      clearTimer(timersRef.current.market);
      clearTimer(timersRef.current.status);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, refreshStatus, refreshMarket, refreshConfig]);

  // arm tick
  useEffect(() => {
    if (!isArmed) return;
    clearTimer(timersRef.current.armTick);
    timersRef.current.armTick = setInterval(() => setArmedUntil((v) => v), 250);
    return () => clearTimer(timersRef.current.armTick);
  }, [isArmed]);

  const armRemainingSec = useMemo(() => {
    if (!isArmed) return 0;
    return Math.max(0, Math.ceil((armedUntil - Date.now()) / 1000));
  }, [armedUntil, isArmed]);

  function armNow() {
    setArmedUntil(Date.now() + ARM_WINDOW_MS);
  }
  function disarm() {
    setArmedUntil(0);
  }

  function onSelect(e) {
    const id = e.target.value;
    setSelected(id);
    onActiveBotChange?.(id);
    disarm();
    setStartConfirmOpen(false);
  }

  /* ----------------------------
     ✅ Derived state (canonical)
  ---------------------------- */

  const intent = normalizeIntent(status?.intent); // no default "paused"
  const eff = normalizeEff(status?.effective_state);

  const hbAge = Number.isFinite(Number(status?.heartbeatAgeSec)) ? Number(status.heartbeatAgeSec) : null;

  const lastError = safeStr(status?.lastError, "");
  const pausedReason = safeStr(status?.pausedReason, "");
  const message = safeStr(status?.message, "");

  const marketOk = market && typeof market === "object" && market.ok === true;
  const isOpen = marketOk ? Boolean(market.is_open) : null;

  const nextOpenEpoch =
    n(status?.nextOpenEpoch, 0) > 0
      ? n(status.nextOpenEpoch)
      : n(market?.next_open, 0) > 0
      ? n(market.next_open)
      : 0;

  // Offline always overrides other display states
  const isOffline = eff === "offline";
  const isErr = eff === "error" || Boolean(lastError);

  const isWaiting = eff === "waiting_for_market";
  const isStarting = eff === "starting";

  // Running means effective is truly executing-ish (not "intent running")
  const isRunningEff = eff === "running" || eff === "degraded";

  // Paused means effective paused OR intent paused (when not offline)
  const isPaused = !isOffline && (eff === "paused" || intent === "paused");

  // Disarmed is a “disabled” state if you ever return it later
  const isDisarmed = eff === "disarmed" || intent === "disarmed";

  // For the pill label (what the user perceives as the runtime state)
  const runtimeLabel = isOffline
    ? "OFFLINE"
    : isErr
    ? "ERROR"
    : isWaiting
    ? "WAITING"
    : isStarting
    ? "STARTING"
    : isRunningEff
    ? "LIVE"
    : isPaused
    ? "PAUSED"
    : isDisarmed
    ? "DISARMED"
    : "IDLE";

  const runtimeTone = isErr || isOffline ? "neg" : isRunningEff ? "pos" : isWaiting || isStarting ? "pos" : "warn";

  const statusLine = isErr
    ? `Error: ${lastError || "unknown"}`
    : isOffline
    ? hbAge != null
      ? `Offline · ${fmtAge(hbAge)} since heartbeat`
      : "Offline · no heartbeat"
    : isWaiting
    ? "Waiting for market open"
    : isStarting
    ? "Starting…"
    : isRunningEff
    ? isOpen === false
      ? "Running (market closed)"
      : "Running"
    : isPaused
    ? pausedReason || message || "Paused"
    : message || "Idle";

  const canArm = !busy && !isRunningEff && !isWaiting && !isStarting;
  const canStart = !busy && !isRunningEff && !isWaiting && !isStarting && isArmed;
  const canPause = !busy && (isRunningEff || isWaiting || isStarting);

  async function doStart() {
    setUiError("");
    setBusy(true);
    abortInflight("action");
    const ac = new AbortController();
    inflightRef.current.action = ac;

    try {
      if (typeof onStartBot === "function") {
        await onStartBot({ bot_id: selected, mode });
      } else {
        await apiPost("/api/bots/start", { bot_id: selected, mode }, { signal: ac.signal });
      }
      await refreshStatus(selected);
    } catch (e) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setUiError(String(e?.message || e));
    } finally {
      if (inflightRef.current.action === ac) inflightRef.current.action = null;
      if (aliveRef.current) setBusy(false);
    }
  }

  async function doPause() {
    setUiError("");
    setBusy(true);
    abortInflight("action");
    const ac = new AbortController();
    inflightRef.current.action = ac;

    try {
      if (typeof onStopBot === "function") {
        await onStopBot({ bot_id: selected });
      } else {
        await apiPost("/api/bots/stop", { bot_id: selected, paused_reason: "manual_pause" }, { signal: ac.signal });
      }
      await refreshStatus(selected);
    } catch (e) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setUiError(String(e?.message || e));
    } finally {
      if (inflightRef.current.action === ac) inflightRef.current.action = null;
      if (aliveRef.current) setBusy(false);
    }
  }

  function requestStart() {
    if (!canStart) return;
    setStartConfirmOpen(true);
  }

  async function confirmStart() {
    setStartConfirmOpen(false);
    disarm();
    await doStart();
  }

  async function openLog() {
    setUiError("");
    setLogOpen(true);
    setLogBusy(true);
    try {
      const data = await apiGet(`/api/bots/log?bot_id=${encodeURIComponent(selected)}&limit=50`);
      const items = Array.isArray(data?.items) ? data.items : [];
      setLogItems(items);
    } catch (e) {
      setLogItems([]);
      setUiError(String(e?.message || e));
    } finally {
      setLogBusy(false);
    }
  }

  function openRisk() {
    setUiError("");
    setRiskOpen(true);
  }

  async function saveRisk() {
    setUiError("");
    setRiskBusy(true);
    try {
      const payload = {
        bot_id: selected,
        config: {
          risk_per_trade: riskDraft.risk_per_trade,
          max_trades_per_day: riskDraft.max_trades_per_day,
          min_confidence: riskDraft.min_confidence,
        },
      };
      await apiPost("/api/bots/config", payload);
      await refreshConfig(selected);
      setRiskOpen(false);
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      setRiskBusy(false);
    }
  }

  return (
    <>
      <div className="botCard">
        <div className="botCardHead">
          <div className="botCardTitleRow">
            <div className="botCardTitle">Bot Control</div>
            <HelpTooltip text="Arm → Start. Pause anytime. This card only controls the bot; intents/opportunities are shown elsewhere on the dashboard." />
          </div>

          <div className="botPillRow">
            <div className="botCardStatePill mode" title="Paper trading only (live soon).">
              {mode === "paper" ? "PAPER" : "PAPER"}
            </div>

            <div
              className={`botCardStatePill ${isArmed ? "warn" : "neg"}`}
              title={isArmed ? "Start enabled briefly." : "Arm to enable Start."}
            >
              {isArmed ? `ARMED · ${armRemainingSec}s` : "DISARMED"}
            </div>

            {/* ✅ runtime state pill (LIVE/PAUSED/OFFLINE/WAITING/STARTING/ERROR) */}
            <div className={`botCardStatePill status ${pillTone(runtimeTone)}`}>{runtimeLabel}</div>
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

              <div className="botHint">{safeStr(available.find((b) => b.id === selected)?.description, "")}</div>
            </div>

            <div className="botActions">
              <button className="botBtn" type="button" onClick={openLog} disabled={busy} aria-label="View log">
                View log
              </button>

              <button className="botBtn" type="button" onClick={openRisk} disabled={busy} aria-label="Risk controls">
                Risk Controls
              </button>

              {!isRunningEff && !isWaiting && !isStarting ? (
                <button className="botBtn" type="button" onClick={isArmed ? disarm : armNow} disabled={!canArm}>
                  {isArmed ? "Disarm" : "Arm"}
                </button>
              ) : null}

              {isRunningEff || isWaiting || isStarting ? (
                <button className="botBtn stop" type="button" onClick={doPause} disabled={!canPause}>
                  Pause
                </button>
              ) : (
                <button
                  className="botBtn start"
                  type="button"
                  onClick={requestStart}
                  disabled={!canStart}
                  title={!isArmed ? "Arm first." : "Start bot"}
                >
                  Start
                </button>
              )}
            </div>
          </div>

          <div className="botGrid">
            <div className="botTile">
              <div className="botTileLabel">Intent</div>
              <div className="botTileValue">{intent || "—"}</div>
            </div>

            <div className="botTile">
              <div className="botTileLabel">Effective</div>
              <div className="botTileValue">{eff || "—"}</div>
            </div>

            <div className="botTile">
              <div className="botTileLabel">Heartbeat</div>
              <div className="botTileValue">{hbAge == null ? "—" : `${fmtAge(hbAge)} ago`}</div>
            </div>

            <div className="botTile">
              <div className="botTileLabel">Next open</div>
              <div className="botTileValue">{nextOpenEpoch ? fmtTime(nextOpenEpoch) : "—"}</div>
            </div>

            <div className="botTile" style={{ gridColumn: "1 / -1" }}>
              <div className="botTileLabel">Status</div>
              <div className="botTileValue">{statusLine}</div>
              {message ? (
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800, marginTop: 4 }}>{message}</div>
              ) : null}
            </div>
          </div>

          {uiError ? <div className="botError">{uiError}</div> : null}
        </div>
      </div>

      {/* Start confirm */}
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
            Start: <span className="mono">{selected}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
            Mode: <span className="mono">{mode}</span> · You can Pause anytime.
          </div>
        </div>
      </Modal>

      {/* View log */}
      <Modal
        open={logOpen}
        title="Bot log"
        onClose={() => setLogOpen(false)}
        footer={
          <button className="mBtn" type="button" onClick={() => setLogOpen(false)} disabled={logBusy}>
            Close
          </button>
        }
      >
        {logBusy ? (
          <div style={{ fontWeight: 800, opacity: 0.8 }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {logItems.length === 0 ? (
              <div style={{ fontWeight: 800, opacity: 0.8 }}>No log entries.</div>
            ) : (
              logItems.map((it, idx) => (
                <div key={idx} style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.85 }}>
                    {safeStr(it.level, "info").toUpperCase()} · {it.ts ? fmtTime(it.ts) : "—"}
                  </div>
                  <div style={{ fontWeight: 800, marginTop: 6 }}>{safeStr(it.message, "")}</div>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* Risk controls */}
      <Modal
        open={riskOpen}
        title="Risk Controls"
        onClose={() => setRiskOpen(false)}
        footer={
          <>
            <button className="mBtn" type="button" onClick={() => setRiskOpen(false)} disabled={riskBusy}>
              Cancel
            </button>
            <button className="mBtn mBtnPrimary" type="button" onClick={saveRisk} disabled={riskBusy}>
              Save
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.85 }}>risk_per_trade</div>
            <input
              className="botInput"
              value={riskDraft.risk_per_trade}
              onChange={(e) => setRiskDraft((d) => ({ ...d, risk_per_trade: e.target.value }))}
              placeholder="0.005"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.85 }}>max_trades_per_day</div>
            <input
              className="botInput"
              value={riskDraft.max_trades_per_day}
              onChange={(e) => setRiskDraft((d) => ({ ...d, max_trades_per_day: e.target.value }))}
              placeholder="3"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.85 }}>min_confidence</div>
            <input
              className="botInput"
              value={riskDraft.min_confidence}
              onChange={(e) => setRiskDraft((d) => ({ ...d, min_confidence: e.target.value }))}
              placeholder="0.62"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
