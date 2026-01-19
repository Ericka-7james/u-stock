// frontend/src/components/dashboard/cards/BotControlCard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import Modal from "../../common/Modal.jsx";
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

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * BotControlCard
 */
export default function BotControlCard({
  activeBotId,
  onActiveBotChange,
  onStateChange,
  onBotStateChange,
}) {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState(activeBotId || "ema_trend");

  const [status, setStatus] = useState(null);
  const [market, setMarket] = useState(null);

  const [config, setConfig] = useState(null);

  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState("");

  // Modals
  const [cfgOpen, setCfgOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const [cfgDraft, setCfgDraft] = useState({
    mode: "paper",
    risk_per_trade: 0.005,
    max_trades_per_day: 3,
    min_confidence: 0.62,
  });

  const [logItems, setLogItems] = useState([]);
  const [logBusy, setLogBusy] = useState(false);
  const [logErr, setLogErr] = useState("");

  const statusTimerRef = useRef(null);
  const marketTimerRef = useRef(null);

  const selectedMeta = useMemo(() => available.find((b) => b.id === selected) || null, [available, selected]);

  // ---- available bots ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await apiGet("/api/bots/available");
        if (!mounted) return;
        const bots = Array.isArray(data?.bots) ? data.bots : [];
        setAvailable(bots);
        const fallback = activeBotId || bots?.[0]?.id || "ema_trend";
        setSelected(fallback);
      } catch (e) {
        if (!mounted) return;
        setUiError(String(e?.message || e));
      }
    })();
    return () => (mounted = false);
  }, [activeBotId]);

  // ---- market session ----
  async function refreshMarketSession() {
    try {
      const data = await apiGet("/api/market/us/session");
      setMarket(data);
    } catch {
      // ignore
    }
  }

  // ---- status ----
  async function refreshStatus(botId = selected) {
    const id = safeStr(botId);
    if (!id) return;
    const data = await apiGet(`/api/bots/status?bot_id=${encodeURIComponent(id)}`);
    setStatus(data);
    onStateChange?.(data);
    onBotStateChange?.(data);
  }

  // ---- config ----
  async function refreshConfig(botId = selected) {
    const id = safeStr(botId);
    if (!id) return;
    try {
      const data = await apiGet(`/api/bots/config?bot_id=${encodeURIComponent(id)}`);
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
      // ignore for now
    }
  }

  // Start timers on selected change
  useEffect(() => {
    if (!selected) return;

    setUiError("");
    refreshStatus(selected);
    refreshMarketSession();
    refreshConfig(selected);

    if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    if (marketTimerRef.current) clearInterval(marketTimerRef.current);

    statusTimerRef.current = setInterval(() => refreshStatus(selected), 5000);
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
      await apiPost("/api/bots/start", { bot_id: selected, mode: safeStr(cfgDraft.mode, "paper") });
      await refreshStatus(selected);
      await refreshMarketSession();
      await refreshConfig(selected);
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

  // UI state
  const rawState = safeStr(status?.state, "stopped");
  const mode = safeStr(status?.mode, safeStr(config?.mode, "paper"));

  const backendRunning = rawState === "running";
  const backendPaused = rawState === "paused";

  const marketOk = market && typeof market === "object" && market.ok === true;
  const isOpen = marketOk ? Boolean(market.is_open) : null;

  const nextOpenEpoch =
    Number.isFinite(Number(status?.nextOpenEpoch)) && Number(status?.nextOpenEpoch) > 0
      ? Number(status?.nextOpenEpoch)
      : Number.isFinite(Number(market?.next_open)) && Number(market?.next_open) > 0
      ? Number(market?.next_open)
      : null;

  const uiPausedBecauseMarket = isOpen === false && backendRunning;
  const uiPaused = backendPaused || uiPausedBecauseMarket;
  const uiState = uiPaused ? "paused" : backendRunning ? "running" : "stopped";

  const statusDetail = uiPaused
    ? safeStr(status?.pausedReason, isOpen === false ? "Market closed" : "Paused")
    : backendRunning
    ? "Running"
    : "Stopped";

  // ----- Log modal actions -----
  async function openLog() {
    setLogErr("");
    setLogItems([]);
    setLogOpen(true);
    setLogBusy(true);
    try {
      const data = await apiGet(`/api/bots/log?bot_id=${encodeURIComponent(selected)}&limit=120`);
      const items = Array.isArray(data?.items) ? data.items : [];
      setLogItems(items.reverse()); // newest at bottom feels better in a modal
    } catch (e) {
      setLogErr(String(e?.message || e));
    } finally {
      setLogBusy(false);
    }
  }

  async function saveConfig() {
    setUiError("");
    setBusy(true);
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
      await apiPost("/api/bots/config", payload);
      await refreshConfig(selected);
      setCfgOpen(false);
    } catch (e) {
      setUiError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const cfgSummary = config
    ? `Mode ${safeStr(config.mode, "paper")} · Risk ${(n(config.risk_per_trade, 0) * 100).toFixed(2)}% · Max ${Math.floor(
        n(config.max_trades_per_day, 0)
      )}/day · Min conf ${n(config.min_confidence, 0).toFixed(2)}`
    : "Not loaded yet";

  return (
    <>
      <div className="botCard">
        <div className="botCardHead">
          <div className="botCardTitleRow">
            <div className="botCardTitle">Bot Control</div>
            <HelpTooltip text="Select a bot, then Start/Stop. Use Risk Controls to tune behavior. Logs show runner + bot messages." />
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
              <button className="botBtn" type="button" onClick={() => setCfgOpen(true)} disabled={busy}>
                Risk Controls
              </button>

              <button className="botBtn" type="button" onClick={openLog} disabled={busy}>
                View log
              </button>

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
                    <div className="botPausedSub">Next open: {nextOpenEpoch ? fmtTime(nextOpenEpoch) : "—"}</div>
                  </>
                ) : (
                  <span>{statusDetail}</span>
                )}
              </div>
            </div>

            {/* NEW: Risk summary tile */}
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
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Example: 0.005 = 0.5% risk per trade
            </div>
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
