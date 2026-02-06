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
  return remH ? `${d}d ${remH}h` : `${d}`;
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
  const [selected, setSelected] = useState(() => safeStr(activeBotId, "ema_trend"));

  const [status, setStatus] = useState(null);
  const [market, setMarket] = useState(null);
  const [config, setConfig] = useState(null);

  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState("");

  // confirm start
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);

  // ✅ NEW: confirm arm
  const [armConfirmOpen, setArmConfirmOpen] = useState(false);

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

  // mode (paper-only for now)
  const [mode, setMode] = useState("paper");

  // Refs to avoid “mode/config changed → callback recreated → effect reruns → abort → canceled”
  const modeRef = useRef("paper");
  const configModeRef = useRef("");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    configModeRef.current = safeStr(config?.mode, "");
  }, [config?.mode, config]);

  const aliveRef = useRef(true);
  const inflightRef = useRef({ available: null, status: null, market: null, config: null, action: null });
  const timersRef = useRef({ statusPoll: null, marketPoll: null });

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

  // sync selected with parent (only when parent provides a real id)
  useEffect(() => {
    const next = safeStr(activeBotId, "");
    if (!next) return;
    setSelected((prev) => (prev === next ? prev : next));
    setStartConfirmOpen(false);
    setArmConfirmOpen(false);
  }, [activeBotId]);

  // load bots list (ONCE)
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

        setSelected((prev) => {
          const cur = safeStr(prev, "");
          if (cur) return cur;
          return safeStr(activeBotId, bots?.[0]?.id || "ema_trend");
        });
      } catch (e) {
        if (!aliveRef.current || ac.signal.aborted) return;
        setUiError(String(e?.message || e));
      } finally {
        if (inflightRef.current.available === ac) inflightRef.current.available = null;
      }
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ✅ STABLE — avoids rerun/abort loop
  const refreshStatus = useCallback(async (botId) => {
    const id = safeStr(botId);
    if (!id || inflightRef.current.status) return;

    const ac = new AbortController();
    inflightRef.current.status = ac;

    try {
      const data = await apiGet(`/api/bots/status?bot_id=${encodeURIComponent(id)}`, { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;

      setStatus(data);

      const currentMode = safeStr(modeRef.current, "paper");
      const cfgMode = safeStr(configModeRef.current, "");
      const nextMode = safeStr(data?.mode, cfgMode || currentMode);
      setMode(nextMode === "live" ? "paper" : nextMode);
    } catch {
      // ignore
    } finally {
      if (inflightRef.current.status === ac) inflightRef.current.status = null;
    }
  }, []);

  // polling on selected
  useEffect(() => {
    const id = safeStr(selected, "");
    if (!id) return;

    setUiError("");

    refreshConfig(id);
    refreshStatus(id);
    refreshMarket();

    clearTimer(timersRef.current.marketPoll);
    timersRef.current.marketPoll = setInterval(() => refreshMarket(), 30_000);

    clearTimer(timersRef.current.statusPoll);
    timersRef.current.statusPoll = setInterval(() => refreshStatus(id), 4_000);

    return () => {
      clearTimer(timersRef.current.marketPoll);
      clearTimer(timersRef.current.statusPoll);
    };
  }, [selected, refreshStatus, refreshMarket, refreshConfig]);

  function onSelect(e) {
    const id = e.target.value;
    setSelected(id);
    onActiveBotChange?.(id);
    setStartConfirmOpen(false);
    setArmConfirmOpen(false);
  }

  /* ----------------------------
     Derived state (canonical)
  ---------------------------- */

  const intent = normalizeIntent(status?.intent);
  const eff = normalizeEff(status?.effective_state);

  const desiredState = safeStr(status?.desired_state, "");
  const isArmed = desiredState === "armed"; // ✅ persisted arming
  const isDesiredRunning = desiredState === "running";

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

  const isOffline = eff === "offline";
  const isErr = eff === "error" || Boolean(lastError);

  const isWaiting = eff === "waiting_for_market";
  const isStarting = eff === "starting";
  const isRunningEff = eff === "running" || eff === "degraded";
  const isPaused = !isOffline && (eff === "paused" || intent === "paused");
  const isDisarmed = !isArmed && !isDesiredRunning && (eff === "disarmed" || intent === "disarmed");

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
    : isArmed
    ? "ARMED"
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
    : isArmed
    ? "Armed (persisted) · Ready to start"
    : isPaused
    ? pausedReason || message || "Paused"
    : message || "Idle";

  const canArm = !busy && !isRunningEff && !isWaiting && !isStarting && !isArmed;
  const canDisarm = !busy && isArmed && !isRunningEff && !isWaiting && !isStarting;

  // ✅ Start only allowed if persisted-arm is present
  const canStart = !busy && !isRunningEff && !isWaiting && !isStarting && isArmed;
  const canPause = !busy && (isRunningEff || isWaiting || isStarting);

  async function doArm() {
    setUiError("");
    setBusy(true);
    abortInflight("action");
    const ac = new AbortController();
    inflightRef.current.action = ac;

    try {
      await apiPost("/api/bots/arm", { bot_id: selected, mode }, { signal: ac.signal });
      await refreshStatus(selected);
    } catch (e) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setUiError(String(e?.message || e));
    } finally {
      if (inflightRef.current.action === ac) inflightRef.current.action = null;
      if (aliveRef.current) setBusy(false);
    }
  }

  async function doDisarm() {
    setUiError("");
    setBusy(true);
    abortInflight("action");
    const ac = new AbortController();
    inflightRef.current.action = ac;

    try {
      await apiPost("/api/bots/disarm", { bot_id: selected }, { signal: ac.signal });
      await refreshStatus(selected);
    } catch (e) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setUiError(String(e?.message || e));
    } finally {
      if (inflightRef.current.action === ac) inflightRef.current.action = null;
      if (aliveRef.current) setBusy(false);
    }
  }

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
    await doStart();
  }

  function requestArm() {
    if (!canArm) return;
    setArmConfirmOpen(true);
  }

  async function confirmArm() {
    setArmConfirmOpen(false);
    await doArm();
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
            <HelpTooltip text="Arm → Start. Pause anytime. Arm is persisted server-side (survives logout) until you Disarm." />
          </div>

          <div className="botPillRow">
            <div className="botCardStatePill mode" title="Paper trading only (live soon).">
              {mode === "paper" ? "PAPER" : "PAPER"}
            </div>

            <div
              className={`botCardStatePill ${isArmed ? "warn" : "neg"}`}
              title={isArmed ? "Armed (persisted). Start enabled." : "Arm to enable Start."}
            >
              {isArmed ? "ARMED" : "DISARMED"}
            </div>

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
                isArmed ? (
                  <button className="botBtn" type="button" onClick={doDisarm} disabled={!canDisarm}>
                    Disarm
                  </button>
                ) : (
                  <button className="botBtn" type="button" onClick={requestArm} disabled={!canArm}>
                    Arm
                  </button>
                )
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
              <div className="botTileLabel">Desired</div>
              <div className="botTileValue">{desiredState || "—"}</div>
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

      {/* ✅ NEW: Arm confirm modal */}
      <Modal
        open={armConfirmOpen}
        title="Arm this bot?"
        onClose={() => setArmConfirmOpen(false)}
        footer={
          <>
            <button className="mBtn" type="button" onClick={() => setArmConfirmOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="mBtn mBtnPrimary" type="button" onClick={confirmArm} disabled={busy}>
              Confirm arm
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>
            Arm: <span className="mono">{selected}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
            This persists server-side (survives logout) until you Disarm.
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
            Mode: <span className="mono">{mode}</span>
          </div>
        </div>
      </Modal>

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
          {!isArmed ? (
            <div style={{ fontSize: 12, fontWeight: 900, color: "#b91c1c" }}>
              Not armed. Close and Arm first.
            </div>
          ) : null}
        </div>
      </Modal>

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
