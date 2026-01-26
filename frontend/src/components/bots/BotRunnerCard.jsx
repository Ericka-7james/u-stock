// frontend/src/components/bots/BotRunnerCard.jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

import HelpTooltip from "../common/HelpTooltip";
import "../../css/bots/botRunnerCard.css";

async function safeErrorMessage(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const data = await res.json();
      return data?.detail || data?.message || `${res.status} ${res.statusText}`;
    } catch {
      return `${res.status} ${res.statusText}`;
    }
  }
  const text = await res.text();
  return `Backend returned non-JSON (${res.status}). First 80 chars: ${text.slice(0, 80)}`;
}

function normalizeEffectiveState(s) {
  const v = String(s || "").toLowerCase().trim();
  if (v === "running") return "running";
  if (v === "waiting_for_market" || v === "waiting") return "waiting_for_market";
  if (v === "paused") return "paused";
  if (v === "offline") return "offline";
  if (v === "error" || v === "failed") return "error";
  if (v === "starting") return "starting";
  if (v === "stopped") return "stopped";
  if (v === "degraded") return "degraded";
  return "unknown";
}

function formatUpdatedAtEpoch(epoch) {
  const t = Number(epoch || 0);
  if (!Number.isFinite(t) || t <= 0) return "";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "";
  }
}

function formatNextOpen(epoch) {
  const t = Number(epoch || 0);
  if (!Number.isFinite(t) || t <= 0) return "";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "";
  }
}

export default function BotRunnerCard() {
  const { isAuthed, authFetch } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [alpacaStatus, setAlpacaStatus] = useState("unknown"); // connected | not_connected | unknown
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const BOT_OPTIONS = useMemo(
    () => [{ id: "ema_trend", name: "EMA Trend Bot" }],
    []
  );

  const [selectedBotId, setSelectedBotId] = useState(BOT_OPTIONS[0]?.id || "ema_trend");
  const [botStatuses, setBotStatuses] = useState({}); // { [botId]: statusObj }

  // Logs modal state
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsBotId, setLogsBotId] = useState("");
  const [logsBotName, setLogsBotName] = useState("");
  const [logsText, setLogsText] = useState("");
  const [logsUpdatedAt, setLogsUpdatedAt] = useState("");

  const alpacaPill = useMemo(() => {
    if (!isAuthed) return { label: "Sign in required", cls: "botrun-pill botrun-pill--off" };
    if (alpacaStatus === "connected") return { label: "Alpaca connected", cls: "botrun-pill botrun-pill--on" };
    if (alpacaStatus === "not_connected")
      return { label: "Alpaca not connected", cls: "botrun-pill botrun-pill--warn" };
    return { label: "Checking Alpaca…", cls: "botrun-pill" };
  }, [isAuthed, alpacaStatus]);

  const selectedBot = useMemo(() => {
    return BOT_OPTIONS.find((b) => b.id === selectedBotId) || BOT_OPTIONS[0] || null;
  }, [BOT_OPTIONS, selectedBotId]);

  const selectedStatus = useMemo(() => {
    const s = botStatuses?.[selectedBotId] || {};
    const eff = normalizeEffectiveState(s.effective_state || s.effectiveState || s.state);
    return {
      botId: selectedBotId,
      intent: String(s.intent || "").toLowerCase() || "paused",
      effective: eff,
      reasonCode: s.reason_code || s.reasonCode || "",
      message: s.message || "",
      heartbeatAt: s.heartbeatAt || s.heartbeat_at || 0,
      lastTick: s.lastTick || s.last_tick || 0,
      nextOpenEpoch: s.nextOpenEpoch || s.next_open_epoch || 0,
      pausedReason: s.pausedReason || s.paused_reason || "",
      lastError: s.lastError || s.last_error || "",
    };
  }, [botStatuses, selectedBotId]);

  const statusPill = useMemo(() => {
    const st = selectedStatus.effective;

    if (st === "running") return { label: "Running", cls: "botrun-pill botrun-pill--on" };
    if (st === "waiting_for_market") return { label: "Waiting for market", cls: "botrun-pill botrun-pill--wait" };
    if (st === "paused") return { label: "Paused", cls: "botrun-pill botrun-pill--paused" };
    if (st === "starting") return { label: "Starting…", cls: "botrun-pill" };
    if (st === "offline") return { label: "Offline", cls: "botrun-pill botrun-pill--off" };
    if (st === "error") return { label: "Error", cls: "botrun-pill botrun-pill--bad" };
    if (st === "degraded") return { label: "Degraded", cls: "botrun-pill botrun-pill--warn" };
    if (st === "stopped") return { label: "Stopped", cls: "botrun-pill botrun-pill--off" };
    return { label: "Unknown", cls: "botrun-pill" };
  }, [selectedStatus.effective]);

  const activeBots = useMemo(() => {
    // "Active" means intent running (even if waiting_for_market)
    return BOT_OPTIONS.filter((b) => {
      const s = botStatuses?.[b.id] || {};
      const intent = String(s.intent || "").toLowerCase();
      const eff = normalizeEffectiveState(s.effective_state || s.effectiveState || s.state);
      if (eff === "offline") return false;
      return intent === "running" || eff === "running" || eff === "waiting_for_market";
    });
  }, [BOT_OPTIONS, botStatuses]);

  const activeSummary = useMemo(() => {
    const running = activeBots.filter((b) => normalizeEffectiveState(botStatuses?.[b.id]?.effective_state) === "running");
    const waiting = activeBots.filter((b) => normalizeEffectiveState(botStatuses?.[b.id]?.effective_state) === "waiting_for_market");
    return { runningCount: running.length, waitingCount: waiting.length, total: activeBots.length };
  }, [activeBots, botStatuses]);

  useEffect(() => {
    const aliveRef = { alive: true };

    async function loadIntegrationStatus() {
      setError("");
      if (!isAuthed) {
        setAlpacaStatus("unknown");
        return;
      }

      try {
        const res = await authFetch("/integrations", { method: "GET" });
        if (!res.ok) throw new Error(await safeErrorMessage(res));
        const data = await res.json();

        const apps = Array.isArray(data?.apps) ? data.apps : Array.isArray(data?.items) ? data.items : [];
        const alp = apps.find((a) => String(a?.provider || "").toLowerCase() === "alpaca");
        const status = String(alp?.status || "not_connected").toLowerCase();

        if (!aliveRef.alive) return;
        setAlpacaStatus(status === "connected" ? "connected" : "not_connected");
      } catch (e) {
        if (!aliveRef.alive) return;
        setAlpacaStatus("unknown");
        setError(e?.message || "Could not check integrations.");
      }
    }

    async function loadBotStatuses() {
      if (!isAuthed) {
        setBotStatuses({});
        return;
      }

      try {
        const res = await authFetch("/bots/statuses", { method: "GET" });
        if (!res.ok) throw new Error(await safeErrorMessage(res));
        const data = await res.json();

        const statuses = data?.statuses && typeof data.statuses === "object" ? data.statuses : {};
        if (!aliveRef.alive) return;
        setBotStatuses(statuses || {});
      } catch (e) {
        if (!aliveRef.alive) return;
        setError(e?.message || "Could not load bot statuses.");
      }
    }

    async function init() {
      setLoading(true);
      setError("");
      setNotice("");
      try {
        await Promise.all([loadIntegrationStatus(), loadBotStatuses()]);
      } finally {
        if (aliveRef.alive) setLoading(false);
      }
    }

    init();

    const t = window.setInterval(() => {
      loadBotStatuses();
    }, 5000);

    return () => {
      aliveRef.alive = false;
      window.clearInterval(t);
    };
  }, [isAuthed, authFetch]);

  async function refreshStatuses() {
    try {
      const res = await authFetch("/bots/statuses", { method: "GET" });
      if (!res.ok) throw new Error(await safeErrorMessage(res));
      const data = await res.json();
      setBotStatuses(data?.statuses || {});
    } catch (e) {
      setError(e?.message || "Could not refresh bot statuses.");
    }
  }

  async function startSelectedBot() {
    setError("");
    setNotice("");

    if (!isAuthed) {
      navigate("/auth");
      return;
    }
    if (alpacaStatus !== "connected") {
      setError("Alpaca is not connected. Connect Alpaca first.");
      return;
    }
    if (!selectedBot?.id) return;

    setBusy(true);
    try {
      const res = await authFetch("/bots/start", {
        method: "POST",
        body: JSON.stringify({ bot_id: selectedBot.id }),
      });
      if (!res.ok) throw new Error(await safeErrorMessage(res));

      setNotice(`Set ${selectedBot.name} to RUN. (It may wait for market.)`);
      await refreshStatuses();
    } catch (e) {
      setError(e?.message || "Could not start bot.");
    } finally {
      setBusy(false);
    }
  }

  async function pauseSelectedBot() {
    setError("");
    setNotice("");

    if (!isAuthed) {
      navigate("/auth");
      return;
    }
    if (!selectedBot?.id) return;

    setBusy(true);
    try {
      // backend accepts either query param or body
      const res = await authFetch("/bots/stop", {
        method: "POST",
        body: JSON.stringify({ bot_id: selectedBot.id, paused_reason: "manual_pause" }),
      });
      if (!res.ok) throw new Error(await safeErrorMessage(res));

      setNotice(`Paused ${selectedBot.name}.`);
      await refreshStatuses();
    } catch (e) {
      setError(e?.message || "Could not pause bot.");
    } finally {
      setBusy(false);
    }
  }

  function openLogsFor(bot) {
    const s = botStatuses?.[bot.id] || {};
    const msg = String(s.message || "").trim();

    setLogsBotId(bot.id);
    setLogsBotName(bot.name);
    setLogsText(msg || "No logs yet for this bot.");
    setLogsUpdatedAt(formatUpdatedAtEpoch(s.heartbeatAt || s.heartbeat_at || 0));
    setLogsOpen(true);
  }

  function closeLogs() {
    setLogsOpen(false);
  }

  const canStart =
    isAuthed &&
    alpacaStatus === "connected" &&
    selectedStatus.intent !== "running" &&
    selectedStatus.effective !== "running" &&
    selectedStatus.effective !== "waiting_for_market" &&
    selectedStatus.effective !== "starting";

  const canPause =
    isAuthed &&
    (selectedStatus.intent === "running" ||
      selectedStatus.effective === "running" ||
      selectedStatus.effective === "waiting_for_market" ||
      selectedStatus.effective === "starting");

  const helperLine = useMemo(() => {
    const eff = selectedStatus.effective;

    if (eff === "waiting_for_market") {
      const when = formatNextOpen(selectedStatus.nextOpenEpoch);
      return when ? `Healthy. Waiting for market open (${when}).` : "Healthy. Waiting for market open.";
    }

    if (eff === "paused") {
      return selectedStatus.pausedReason ? `Paused (${selectedStatus.pausedReason}).` : "Paused. Will not trade.";
    }

    if (eff === "running") {
      const tick = formatUpdatedAtEpoch(selectedStatus.lastTick);
      return tick ? `Loop active. Last tick: ${tick}.` : "Loop active.";
    }

    if (eff === "offline") {
      const hb = formatUpdatedAtEpoch(selectedStatus.heartbeatAt);
      return hb ? `No heartbeat. Last seen: ${hb}.` : "No heartbeat from runner.";
    }

    if (eff === "starting") return "Booting up…";

    if (eff === "error") return selectedStatus.lastError ? `Error: ${selectedStatus.lastError}` : "Error state.";
    if (eff === "degraded") return "Running but missing a dependency.";
    if (eff === "stopped") return "Stopped.";
    return selectedStatus.message || "Status unknown.";
  }, [selectedStatus]);

  return (
    <section className="panel botrun-panel">
      <div className="botrun-top">
        <div>
          <div className="botrun-titleRow">
            <h3 className="botrun-title">Bot Runner</h3>

            <HelpTooltip title="Bot Runner states">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li><strong>Running</strong> — loop is active.</li>
                <li><strong>Waiting for market</strong> — intent is RUN, but market is closed.</li>
                <li><strong>Paused</strong> — manually paused (won’t trade even if market is open).</li>
                <li><strong>Offline</strong> — no heartbeat from runner (Pi down / process dead).</li>
              </ul>
              <p style={{ marginBottom: 0 }}>
                Manage connections in{" "}
                <button type="button" className="botrun-linkBtn" onClick={() => navigate("/apps")}>
                  Connected Apps
                </button>
                .
              </p>
            </HelpTooltip>

            <span className={alpacaPill.cls} title="Integration status">
              {alpacaPill.label}
            </span>
          </div>

          <p className="botrun-subtitle">
            Start/pause bots. “Waiting for market” is healthy and will auto-start at open.
          </p>
        </div>

        <div className="botrun-actions">
          <button
            className="botrun-btn botrun-btn--start"
            onClick={startSelectedBot}
            disabled={!canStart || busy || loading}
          >
            {busy && canStart ? "Starting…" : "Start bot"}
          </button>

          <button
            className="botrun-btn botrun-btn--pause"
            onClick={pauseSelectedBot}
            disabled={!canPause || busy || loading}
          >
            {busy && canPause ? "Pausing…" : "Pause bot"}
          </button>
        </div>
      </div>

      {!!error && <div className="botrun-banner botrun-banner--error">{error}</div>}
      {!!notice && <div className="botrun-banner botrun-banner--ok">{notice}</div>}

      {isAuthed && alpacaStatus === "not_connected" ? (
        <div className="botrun-banner botrun-banner--warn">
          Alpaca isn’t connected yet. Connect Alpaca to start bots.
          <button type="button" className="botrun-linkBtn" onClick={() => navigate("/apps")}>
            Connected Apps
          </button>
        </div>
      ) : null}

      <div className="botrun-body botrun-body--new">
        {/* Left: selected controls */}
        <div className="botrun-box">
          <div className="botrun-boxHeader">
            <div className="botrun-boxTitle">controls</div>
            <span className={statusPill.cls} title="Selected bot status">
              {statusPill.label}
            </span>
          </div>

          <div className="botrun-rowInline">
            <div className="botrun-labelInline">Select bot</div>

            <select
              className="botrun-selectInline"
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              disabled={loading || busy}
            >
              {BOT_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="botrun-muted" style={{ marginTop: 10 }}>
            {helperLine}
          </div>

          {selectedStatus.reasonCode ? (
            <div className="botrun-muted" style={{ marginTop: 6 }}>
              Reason: <span className="mMono">{selectedStatus.reasonCode}</span>
            </div>
          ) : null}
        </div>

        {/* Right: active list */}
        <div className="botrun-box">
          <div className="botrun-boxHeader">
            <div className="botrun-boxTitle">Active (Run intent)</div>
            <div className="botrun-muted">
              {activeSummary.total} total · {activeSummary.runningCount} running · {activeSummary.waitingCount} waiting
            </div>
          </div>

          {loading ? (
            <div className="botrun-muted">Loading status…</div>
          ) : activeBots.length === 0 ? (
            <div className="botrun-muted">No bots are active right now.</div>
          ) : (
            <ul className="botrun-runningList">
              {activeBots.map((b) => {
                const eff = normalizeEffectiveState(botStatuses?.[b.id]?.effective_state);
                const label =
                  eff === "running" ? "Running" : eff === "waiting_for_market" ? "Waiting" : eff;
                const cls =
                  eff === "running"
                    ? "botrun-pill botrun-pill--on"
                    : eff === "waiting_for_market"
                    ? "botrun-pill botrun-pill--wait"
                    : "botrun-pill";
                return (
                  <li key={b.id} className="botrun-runningItem">
                    <span className="botrun-runningName">{b.name}</span>
                    <span className={cls} style={{ marginLeft: 8 }}>
                      {label}
                    </span>
                    <button type="button" className="botrun-logsBtn" onClick={() => openLogsFor(b)}>
                      Logs
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {!isAuthed ? <div className="botrun-foot">Sign in to manage bots.</div> : null}

      {/* Logs modal */}
      {logsOpen && (
        <div className="botrun-modalBackdrop" onClick={closeLogs}>
          <div className="botrun-modal" onClick={(e) => e.stopPropagation()}>
            <button className="botrun-modalClose" onClick={closeLogs} aria-label="Close logs">
              ×
            </button>

            <div className="botrun-modalHeader">
              <div className="botrun-modalTitle">Logs</div>
              <div className="botrun-modalSub">
                <span className="botrun-modalBot">{logsBotName}</span>
                {logsUpdatedAt ? <span className="botrun-modalTime">· {logsUpdatedAt}</span> : null}
              </div>
            </div>

            <div className="botrun-modalBody">
              <pre className="botrun-logText">{logsText}</pre>
            </div>

            <div className="botrun-modalActions">
              <button className="botrun-btn botrun-btn--pause" onClick={closeLogs}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
