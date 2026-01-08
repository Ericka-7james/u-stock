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

function normalizeState(s) {
  const v = String(s || "").toLowerCase();
  if (v === "running" || v === "on") return "running";
  if (v === "paused") return "paused";
  if (v === "stopped" || v === "off") return "stopped";
  if (v === "error" || v === "failed") return "error";
  return "unknown";
}

function formatUpdatedAt(v) {
  if (!v) return "";
  // keep it simple (don’t assume timezone formatting)
  return String(v).replace("T", " ").replace("Z", "");
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
    () => [
      { id: "orb", name: "ORB (Opening Range Breakout)" },
      { id: "ema_vwap", name: "EMA Trend (9/21 + VWAP filter)" },
    ],
    []
  );

  const [selectedBotId, setSelectedBotId] = useState(BOT_OPTIONS[0]?.id || "orb");
  const [botStatuses, setBotStatuses] = useState({});

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
    const raw = normalizeState(s.state);
    return {
      rawState: raw, // running | paused | stopped | error | unknown
      message: s.message || "",
      updatedAt: s.updated_at || s.updatedAt || "",
    };
  }, [botStatuses, selectedBotId]);

  const statusPill = useMemo(() => {
    const st = selectedStatus.rawState;
    if (st === "running") return { label: "Running", cls: "botrun-pill botrun-pill--on" };
    if (st === "paused") return { label: "Paused", cls: "botrun-pill botrun-pill--paused" };
    if (st === "stopped") return { label: "Stopped", cls: "botrun-pill botrun-pill--off" };
    if (st === "error") return { label: "Error", cls: "botrun-pill botrun-pill--bad" };
    return { label: "Unknown", cls: "botrun-pill" };
  }, [selectedStatus.rawState]);

  const runningBots = useMemo(() => {
    return BOT_OPTIONS.filter((b) => normalizeState(botStatuses?.[b.id]?.state) === "running");
  }, [BOT_OPTIONS, botStatuses]);

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

        const apps = Array.isArray(data?.apps) ? data.apps : [];
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
        const res = await authFetch("/bots/status", { method: "GET" });
        if (!res.ok) throw new Error(await safeErrorMessage(res));
        const data = await res.json();

        const statuses = data?.statuses && typeof data.statuses === "object" ? data.statuses : data;

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
      const res = await authFetch("/bots/status", { method: "GET" });
      if (!res.ok) throw new Error(await safeErrorMessage(res));
      const data = await res.json();
      setBotStatuses(data?.statuses || data || {});
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

      setNotice(`Started ${selectedBot.name}.`);
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
      const res = await authFetch("/bots/stop", {
        method: "POST",
        body: JSON.stringify({ bot_id: selectedBot.id }),
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
    setLogsUpdatedAt(formatUpdatedAt(s.updated_at || s.updatedAt || ""));
    setLogsOpen(true);
  }

  function closeLogs() {
    setLogsOpen(false);
  }

  const canStart = isAuthed && alpacaStatus === "connected" && selectedStatus.rawState !== "running";
  const canPause = isAuthed && selectedStatus.rawState === "running";

  return (
    <section className="panel botrun-panel">
      <div className="botrun-top">
        <div>
          <div className="botrun-titleRow">
            <h3 className="botrun-title">Bot Runner</h3>

            <HelpTooltip title="Bot Runner">
              <p style={{ marginTop: 0 }}>
                Start/pause strategies here. The “Currently running” list shows active bots.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li><strong>Logs</strong> shows the bot’s latest messages.</li>
                <li><strong>Alpaca must be connected</strong> to start bots.</li>
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
            Select a strategy, check its status, and start/pause it from here.
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
            <div className="botrun-boxTitle">Bot controls</div>
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
        </div>

        {/* Right: running list with LOGS button */}
        <div className="botrun-box">
          <div className="botrun-boxHeader">
            <div className="botrun-boxTitle">Currently running</div>
            <div className="botrun-muted">{runningBots.length} active</div>
          </div>

          {loading ? (
            <div className="botrun-muted">Loading status…</div>
          ) : runningBots.length === 0 ? (
            <div className="botrun-muted">No bots are running right now.</div>
          ) : (
            <ul className="botrun-runningList">
              {runningBots.map((b) => (
                <li key={b.id} className="botrun-runningItem">
                  <span className="botrun-runningName">{b.name}</span>
                  <button
                    type="button"
                    className="botrun-logsBtn"
                    onClick={() => openLogsFor(b)}
                  >
                    Logs
                  </button>
                </li>
              ))}
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
