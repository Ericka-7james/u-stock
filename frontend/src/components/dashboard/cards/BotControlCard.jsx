// frontend/src/components/dashboard/cards/BotControlCard.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import HelpTooltip from "../../common/HelpTooltip.jsx";
import Modal from "../../common/Modal.jsx";
import LoadingOverlay from "../../common/LoadingOverlay.jsx";
import ErrorModal from "../../common/ErrorMessages.jsx";

import { explainAnyError } from "../../../lib/errorMessages.jsx";
import { BOT_CONTROL_CARD_CONTENT as COPY } from "../../../content/dashboard/botControlCard.content.js";

// ✅ Reuse BotLogsCard styling for the log modal rows
import "../../../css/dashboard/cards/BotLogsCard.css";

import { apiGet, apiPost } from "../../../lib/api/botApi.js";
import { safeStr, n, fmtTime, fmtAge, pillTone, normalizeEff, normalizeIntent } from "../../../lib/format/botFormat.js";

import useInterval from "../../../hooks/useInterval.js";

import "../../../css/dashboard/cards/BotControlCard.css";

/* ----------------------------
   Risk validation (UI-only)
---------------------------- */

function isStrictNumericString(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return /^\d+(\.\d+)?$/.test(s);
}

function validateRiskDraft(draft) {
  const errors = {};

  const rpt = String(draft?.risk_per_trade ?? "").trim();
  const mtd = String(draft?.max_trades_per_day ?? "").trim();
  const mc = String(draft?.min_confidence ?? "").trim();

  if (!isStrictNumericString(rpt)) {
    errors.risk_per_trade = COPY?.modals?.risk?.errors?.risk_per_trade_format || "Enter a number like 0.005";
  } else {
    const val = Number(rpt);
    if (!(val > 0 && val < 1)) {
      errors.risk_per_trade =
        COPY?.modals?.risk?.errors?.risk_per_trade_range || "Must be > 0 and < 1 (example: 0.005)";
    }
  }

  if (!isStrictNumericString(mtd)) {
    errors.max_trades_per_day = COPY?.modals?.risk?.errors?.max_trades_per_day_format || "Enter an integer like 3";
  } else {
    const val = Number(mtd);
    const isInt = Number.isInteger(val);
    if (!isInt || val < 0) {
      errors.max_trades_per_day =
        COPY?.modals?.risk?.errors?.max_trades_per_day_range || "Must be a whole number ≥ 0";
    }
  }

  if (!isStrictNumericString(mc)) {
    errors.min_confidence = COPY?.modals?.risk?.errors?.min_confidence_format || "Enter a number like 0.62";
  } else {
    const val = Number(mc);
    if (!(val >= 0 && val <= 1)) {
      errors.min_confidence =
        COPY?.modals?.risk?.errors?.min_confidence_range || "Must be between 0 and 1 (example: 0.62)";
    }
  }

  return errors;
}

/* ----------------------------
   ✅ Log helpers (match BotLogsCard modal vibe)
---------------------------- */

function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x ?? "");
  }
}

function logSeverity(it) {
  const lvl = String(it?.level || "info").toLowerCase();
  if (lvl === "error") return "error";
  if (lvl === "warn" || lvl === "warning") return "warn";
  return "info";
}

function toneClass(sev) {
  if (sev === "error") return "blog-evt blog-evt--error";
  if (sev === "warn") return "blog-evt blog-evt--warn";
  return "blog-evt";
}

export default function BotControlCard({ activeBotId, onActiveBotChange, onStartBot, onStopBot }) {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState(() => safeStr(activeBotId, ""));

  const [status, setStatus] = useState(null);
  const [market, setMarket] = useState(null);
  const [config, setConfig] = useState(null);

  const [busy, setBusy] = useState(false);

  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const snapshotRef = useRef({ botId: "", status: false, config: false });

  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [armConfirmOpen, setArmConfirmOpen] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logItems, setLogItems] = useState([]);
  const [logBusy, setLogBusy] = useState(false);

  const [riskOpen, setRiskOpen] = useState(false);
  const [riskBusy, setRiskBusy] = useState(false);
  const [riskDraft, setRiskDraft] = useState({
    risk_per_trade: "",
    max_trades_per_day: "",
    min_confidence: "",
  });

  const [riskErrors, setRiskErrors] = useState({});
  const [riskTouched, setRiskTouched] = useState({
    risk_per_trade: false,
    max_trades_per_day: false,
    min_confidence: false,
  });

  const [mode, setMode] = useState("paper");

  const [errModalOpen, setErrModalOpen] = useState(false);
  const [errModal, setErrModal] = useState(null);

  const closeErrorModal = useCallback(() => {
    setErrModalOpen(false);
    setErrModal(null);
  }, []);

  const openErrorModal = useCallback((anyErr, { feature = "bot_control" } = {}) => {
    const friendly = explainAnyError(anyErr, { feature });
    setErrModal({
      title: friendly?.title || "Error",
      body: friendly?.body || "Something went wrong.",
      subtitle: friendly?.subtitle || "",
      image: friendly?.image || null,
      action: friendly?.action || null,
    });
    setErrModalOpen(true);
  }, []);

  const aliveRef = useRef(true);
  const inflightRef = useRef({ available: null, status: null, market: null, config: null, action: null });
  const selectedRef = useRef(safeStr(activeBotId, ""));
  const modeRef = useRef("paper");
  const configModeRef = useRef("");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    configModeRef.current = safeStr(config?.mode, "");
  }, [config?.mode, config]);

  function abortInflight(key) {
    const cur = inflightRef.current?.[key];
    if (cur) cur.abort();
    inflightRef.current[key] = null;
  }

  function maybeStopSnapshotLoading(botId) {
    const id = safeStr(botId, "");
    const s = snapshotRef.current;
    if (s.botId !== id) return;
    if (!s.status && !s.config) setSnapshotLoading(false);
  }

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      Object.keys(inflightRef.current || {}).forEach((k) => abortInflight(k));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = safeStr(activeBotId, "");
    selectedRef.current = next;
    setSelected((prev) => (prev === next ? prev : next));
    setStartConfirmOpen(false);
    setArmConfirmOpen(false);
  }, [activeBotId]);

  useEffect(() => {
    abortInflight("available");
    const ac = new AbortController();
    inflightRef.current.available = ac;

    (async () => {
      try {
        const data = await apiGet("/api/bots/available", { signal: ac.signal });
        if (!aliveRef.current || ac.signal.aborted) return;
        setAvailable(Array.isArray(data?.bots) ? data.bots : []);
      } catch (e) {
        if (!aliveRef.current || ac.signal.aborted) return;
        openErrorModal(e, { feature: "bots_available" });
      } finally {
        if (inflightRef.current.available === ac) inflightRef.current.available = null;
      }
    })();

    return () => ac.abort();
  }, [openErrorModal]);

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

  const refreshConfig = useCallback(
    async (botId) => {
      const id = safeStr(botId, "");
      if (!id || inflightRef.current.config) return;

      const ac = new AbortController();
      inflightRef.current.config = ac;

      try {
        const data = await apiGet(`/api/bots/config?bot_id=${encodeURIComponent(id)}`, { signal: ac.signal });
        if (!aliveRef.current || ac.signal.aborted) return;
        if (selectedRef.current !== id) return;

        const cfg = data?.config && typeof data.config === "object" ? data.config : null;
        setConfig(cfg);

        const m = safeStr(cfg?.mode, "paper");
        setMode(m === "live" ? "paper" : m);

        const nextDraft = {
          risk_per_trade: cfg?.risk_per_trade ?? "",
          max_trades_per_day: cfg?.max_trades_per_day ?? "",
          min_confidence: cfg?.min_confidence ?? "",
        };

        setRiskDraft(nextDraft);
        setRiskErrors(validateRiskDraft(nextDraft));
        setRiskTouched({ risk_per_trade: false, max_trades_per_day: false, min_confidence: false });
      } catch (e) {
        if (aliveRef.current && !ac.signal.aborted) openErrorModal(e, { feature: "bot_config" });
      } finally {
        if (snapshotRef.current.botId === id) {
          snapshotRef.current.config = false;
          maybeStopSnapshotLoading(id);
        }
        if (inflightRef.current.config === ac) inflightRef.current.config = null;
      }
    },
    [openErrorModal]
  );

  const refreshStatus = useCallback(async (botId) => {
    const id = safeStr(botId, "");
    if (!id || inflightRef.current.status) return;

    const ac = new AbortController();
    inflightRef.current.status = ac;

    try {
      const data = await apiGet(`/api/bots/status?bot_id=${encodeURIComponent(id)}`, { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;
      if (selectedRef.current !== id) return;

      setStatus(data);

      const currentMode = safeStr(modeRef.current, "paper");
      const cfgMode = safeStr(configModeRef.current, "");
      const nextMode = safeStr(data?.mode, cfgMode || currentMode);
      setMode(nextMode === "live" ? "paper" : nextMode);
    } catch {
      // fail-open
    } finally {
      if (snapshotRef.current.botId === id) {
        snapshotRef.current.status = false;
        maybeStopSnapshotLoading(id);
      }
      if (inflightRef.current.status === ac) inflightRef.current.status = null;
    }
  }, []);

  useEffect(() => {
    const id = safeStr(selected, "");
    selectedRef.current = id;

    if (!id) {
      setStatus(null);
      setConfig(null);
      setStartConfirmOpen(false);
      setArmConfirmOpen(false);
      snapshotRef.current = { botId: "", status: false, config: false };
      setSnapshotLoading(false);
      return;
    }

    snapshotRef.current = { botId: id, status: true, config: true };
    setSnapshotLoading(true);

    refreshConfig(id);
    refreshStatus(id);
  }, [selected, refreshConfig, refreshStatus]);

  useInterval(() => refreshMarket(), 30_000);
  useInterval(() => {
    const id = selectedRef.current;
    if (id) refreshStatus(id);
  }, selected ? 4_000 : null);

  useEffect(() => {
    refreshMarket();
  }, [refreshMarket]);

  const onSelect = useCallback(
    (e) => {
      const id = safeStr(e.target.value, "");
      setSelected(id);
      selectedRef.current = id;
      onActiveBotChange?.(id);
      setStartConfirmOpen(false);
      setArmConfirmOpen(false);
    },
    [onActiveBotChange]
  );

  /* ----------------------------
     Derived state
  ---------------------------- */

  const hasSelection = Boolean(safeStr(selected, ""));
  const intent = normalizeIntent(status?.intent); // running|stopped
  const eff = normalizeEff(status?.effective_state); // may include offline/error/waiting

  const desiredState = safeStr(status?.desired_state, "");
  const isArmed = Boolean(status?.armed) || desiredState === "armed";
  const hbAge = Number.isFinite(Number(status?.heartbeatAgeSec)) ? Number(status.heartbeatAgeSec) : null;

  const lastError = safeStr(status?.lastError, "");
  const message = safeStr(status?.message, "");

  const marketOk = market && typeof market === "object" && market.ok === true;
  const isOpen = marketOk ? Boolean(market.is_open) : null;

  const nextOpenEpoch =
    n(status?.nextOpenEpoch, 0) > 0
      ? n(status.nextOpenEpoch)
      : n(market?.next_open, 0) > 0
      ? n(market.next_open)
      : 0;

  const isOffline = hasSelection && eff === "offline";
  const isErr = hasSelection && (eff === "error" || Boolean(lastError));

  const isWaiting = hasSelection && eff === "waiting_for_market";
  const isStarting = hasSelection && eff === "starting";
  const isRunningEff = hasSelection && (eff === "running" || eff === "degraded");

  const isStopped =
    hasSelection && !isOffline && !isErr && !isRunningEff && !isWaiting && !isStarting && intent === "stopped";

  const isDisarmed = hasSelection && !isArmed && !isRunningEff && !isWaiting && !isStarting;

  const runtimeLabel = !hasSelection
    ? "—"
    : isOffline
    ? "OFFLINE"
    : isErr
    ? "ERROR"
    : isWaiting
    ? "WAITING"
    : isStarting
    ? "STARTING"
    : isRunningEff
    ? mode === "paper"
      ? "RUNNING"
      : "LIVE"
    : isArmed
    ? "ARMED"
    : isDisarmed
    ? "DISARMED"
    : isStopped
    ? "STOPPED"
    : "IDLE";

  const runtimeTone = !hasSelection ? "warn" : isErr || isOffline ? "neg" : isRunningEff ? "pos" : isWaiting || isStarting ? "pos" : "warn";

  const statusLine = !hasSelection
    ? COPY.status.noneSelected
    : isErr
    ? `${COPY.status.errorPrefix}${lastError || "unknown"}`
    : isOffline
    ? hbAge != null
      ? `${COPY.status.offlinePrefix}${fmtAge(hbAge)}${COPY.status.offlineSuffix}`
      : COPY.status.offlineNoHeartbeat
    : isWaiting
    ? COPY.status.waitingForOpen
    : isStarting
    ? COPY.status.starting
    : isRunningEff
    ? isOpen === false
      ? COPY.status.runningMarketClosed
      : COPY.status.running
    : isArmed
    ? COPY.status.armedReady
    : isDisarmed
    ? COPY.status.disarmed || "Disarmed."
    : isStopped
    ? message || COPY.status.stopped || "Stopped."
    : message || COPY.status.idle;

  const canArm = hasSelection && !busy && !isRunningEff && !isWaiting && !isStarting && !isArmed;
  const canDisarm = hasSelection && !busy && isArmed && !isRunningEff && !isWaiting && !isStarting;

  const marketClosedBlocksStart = hasSelection && marketOk && isOpen === false;

  const canStart = hasSelection && !busy && !isRunningEff && !isWaiting && !isStarting && isArmed && !marketClosedBlocksStart;
  const canPause = hasSelection && !busy && (isRunningEff || isWaiting || isStarting);

  /* ----------------------------
     Actions
  ---------------------------- */

  const runAction = useCallback(
    async (fn, feature) => {
      setBusy(true);
      abortInflight("action");
      const ac = new AbortController();
      inflightRef.current.action = ac;

      try {
        await fn(ac);
      } catch (e) {
        if (!aliveRef.current || ac.signal.aborted) return;
        openErrorModal(e, { feature });
      } finally {
        if (inflightRef.current.action === ac) inflightRef.current.action = null;
        if (aliveRef.current) setBusy(false);
      }
    },
    [openErrorModal]
  );

  const doArm = useCallback(async () => {
    if (!hasSelection) return;
    await runAction(
      async (ac) => {
        await apiPost("/api/bots/arm", { bot_id: selected, mode }, { signal: ac.signal });
        await refreshStatus(selected);
      },
      "bot_arm"
    );
  }, [hasSelection, runAction, selected, mode, refreshStatus]);

  const doDisarm = useCallback(async () => {
    if (!hasSelection) return;
    await runAction(
      async (ac) => {
        await apiPost("/api/bots/disarm", { bot_id: selected }, { signal: ac.signal });
        await refreshStatus(selected);
      },
      "bot_disarm"
    );
  }, [hasSelection, runAction, selected, refreshStatus]);

  const doStart = useCallback(async () => {
    if (!hasSelection) return;
    await runAction(
      async (ac) => {
        if (typeof onStartBot === "function") {
          await onStartBot({ bot_id: selected, mode });
        } else {
          await apiPost("/api/bots/start", { bot_id: selected, mode }, { signal: ac.signal });
        }
        await refreshStatus(selected);
      },
      "bot_start"
    );
  }, [hasSelection, runAction, selected, mode, onStartBot, refreshStatus]);

  const doPause = useCallback(async () => {
    if (!hasSelection) return;
    await runAction(
      async (ac) => {
        if (typeof onStopBot === "function") {
          await onStopBot({ bot_id: selected });
        } else {
          await apiPost("/api/bots/stop", { bot_id: selected }, { signal: ac.signal });
        }
        await refreshStatus(selected);
      },
      "bot_stop"
    );
  }, [hasSelection, runAction, selected, onStopBot, refreshStatus]);

  const requestStart = useCallback(() => {
    if (!hasSelection) return;
    if (!isArmed) return;
    if (marketClosedBlocksStart) return;
    if (!canStart) return;
    setStartConfirmOpen(true);
  }, [hasSelection, isArmed, marketClosedBlocksStart, canStart]);

  const confirmStart = useCallback(async () => {
    setStartConfirmOpen(false);
    await doStart();
  }, [doStart]);

  const requestArm = useCallback(() => {
    if (!canArm) return;
    setArmConfirmOpen(true);
  }, [canArm]);

  const confirmArm = useCallback(async () => {
    setArmConfirmOpen(false);
    await doArm();
  }, [doArm]);

  const openLog = useCallback(async () => {
    if (!hasSelection) return;
    setLogOpen(true);
    setLogBusy(true);
    try {
      const data = await apiGet(`/api/bots/log?bot_id=${encodeURIComponent(selected)}&limit=50`);
      setLogItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setLogItems([]);
      openErrorModal(e, { feature: "bot_log" });
    } finally {
      setLogBusy(false);
    }
  }, [hasSelection, selected, openErrorModal]);

  const openRisk = useCallback(() => {
    if (!hasSelection) return;
    setRiskErrors(validateRiskDraft(riskDraft));
    setRiskTouched({ risk_per_trade: false, max_trades_per_day: false, min_confidence: false });
    setRiskOpen(true);
  }, [hasSelection, riskDraft]);

  const onRiskChange = useCallback((key, value) => {
    setRiskDraft((d) => {
      const next = { ...d, [key]: value };
      setRiskErrors(validateRiskDraft(next));
      return next;
    });
  }, []);

  const onRiskBlur = useCallback((key) => {
    setRiskTouched((t) => ({ ...t, [key]: true }));
  }, []);

  const saveRisk = useCallback(async () => {
    if (!hasSelection) return;

    const errs = validateRiskDraft(riskDraft);
    setRiskErrors(errs);
    setRiskTouched({ risk_per_trade: true, max_trades_per_day: true, min_confidence: true });

    if (Object.keys(errs).length > 0) return;

    setRiskBusy(true);
    try {
      await apiPost("/api/bots/config", {
        bot_id: selected,
        config: {
          risk_per_trade: riskDraft.risk_per_trade,
          max_trades_per_day: riskDraft.max_trades_per_day,
          min_confidence: riskDraft.min_confidence,
        },
      });

      await refreshConfig(selected);
      setRiskOpen(false);
    } catch (e) {
      openErrorModal(e, { feature: "bot_risk_save" });
    } finally {
      setRiskBusy(false);
    }
  }, [hasSelection, selected, riskDraft, refreshConfig, openErrorModal]);

  const selectedMeta = useMemo(() => {
    const id = safeStr(selected, "");
    if (!id) return null;
    return (available || []).find((b) => safeStr(b?.id, "") === id) || null;
  }, [available, selected]);

  const handleErrorAction = useCallback(
    (action) => {
      if (!action?.href) return;
      closeErrorModal();
      window.location.assign(action.href);
    },
    [closeErrorModal]
  );

  const startBlockedReason = useMemo(() => {
    if (!hasSelection) return "";
    if (!marketOk) return "";
    if (isOpen === false) return COPY.actions.startBlockedMarketClosed;
    return "";
  }, [hasSelection, marketOk, isOpen]);

  const showMarketClosedNote = Boolean(startBlockedReason);

  // UPDATED: log message extraction (matches service.py contract)
  const logMessageFor = useCallback((it) => {
    const p = it?.payload && typeof it.payload === "object" ? it.payload : null;
    return safeStr(p?.message, "") || safeStr(p?.paused_reason, "") || safeStr(p?.last_error, "") || safeStr(it?.event_type, "");
  }, []);

  return (
    <>
      <ErrorModal open={errModalOpen} error={errModal} onClose={closeErrorModal} onAction={handleErrorAction} />

      <LoadingOverlay open={snapshotLoading} label={COPY.loading.overlayLabel} subtitle={COPY.loading.overlaySubtitle} />

      <div className="botCard" aria-busy={snapshotLoading}>
        <div className="botCardHead">
          <div className="botCardTitleRow">
            <div className="botCardTitle">{COPY.title}</div>
            <HelpTooltip text={COPY.help} />
          </div>

          <div className="botPillRow">
            <div className="botCardStatePill mode" title={COPY.pills.paper.title}>
              {COPY.pills.paper.label}
            </div>

            <div
              className={`botCardStatePill arm ${hasSelection && isArmed ? "warn" : "neg"}`}
              title={
                !hasSelection
                  ? COPY.pills.armed.titleNone
                  : isArmed
                  ? COPY.pills.armed.titleArmed
                  : COPY.pills.armed.titleDisarmed
              }
            >
              {!hasSelection ? COPY.pills.armed.none : isArmed ? COPY.pills.armed.armed : COPY.pills.armed.disarmed}
            </div>

            <div className={`botCardStatePill status ${pillTone(runtimeTone)}`}>{runtimeLabel}</div>
          </div>
        </div>

        <div className="botCardBody">
          <div className="botCardTopRow">
            <div className="botSelectWrap">
              <label className="botLabel">{COPY.select.label}</label>

              <select className="botSelect" value={safeStr(selected, "")} onChange={onSelect} disabled={busy}>
                <option value="">{COPY.select.placeholder}</option>
                {(available || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id}
                  </option>
                ))}
              </select>

              <div className="botHint">{safeStr(selectedMeta?.description, hasSelection ? "" : COPY.select.hintNone)}</div>
            </div>

            <div className="botActions">
              <button className="botBtn" type="button" onClick={openLog} disabled={busy || !hasSelection}>
                {COPY.actions.viewLog}
              </button>

              <button className="botBtn" type="button" onClick={openRisk} disabled={busy || !hasSelection}>
                {COPY.actions.risk}
              </button>

              {!isRunningEff && !isWaiting && !isStarting ? (
                isArmed ? (
                  <button className="botBtn" type="button" onClick={doDisarm} disabled={!canDisarm}>
                    {COPY.actions.disarm}
                  </button>
                ) : (
                  <button className="botBtn" type="button" onClick={requestArm} disabled={!canArm}>
                    {COPY.actions.arm}
                  </button>
                )
              ) : null}

              {isRunningEff || isWaiting || isStarting ? (
                <button className="botBtn stop" type="button" onClick={doPause} disabled={!canPause}>
                  {COPY.actions.pause}
                </button>
              ) : (
                <button
                  className="botBtn start"
                  type="button"
                  onClick={requestStart}
                  disabled={!canStart}
                  title={
                    !hasSelection
                      ? COPY.actions.startTitleNone
                      : !isArmed
                      ? COPY.actions.startTitleNotArmed
                      : marketClosedBlocksStart
                      ? COPY.actions.startTitleMarketClosed
                      : COPY.actions.startTitleOk
                  }
                >
                  {COPY.actions.start}
                </button>
              )}

              {showMarketClosedNote ? (
                <div className="botInlineNote" role="status" aria-live="polite">
                  {startBlockedReason}
                  {nextOpenEpoch ? (
                    <span className="botInlineNoteSub">
                      {COPY.actions.nextOpenPrefix}
                      <span className="mono">{fmtTime(nextOpenEpoch)}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="botGrid">
            <div className="botTile">
              <div className="botTileLabel">{COPY.tiles.intent}</div>
              <div className="botTileValue">{hasSelection ? intent || "—" : "—"}</div>
            </div>

            <div className="botTile">
              <div className="botTileLabel">{COPY.tiles.effective}</div>
              <div className="botTileValue">{hasSelection ? eff || "—" : "—"}</div>
            </div>

            <div className="botTile">
              <div className="botTileLabel">{COPY.tiles.desired}</div>
              <div className="botTileValue">{hasSelection ? desiredState || "—" : "—"}</div>
            </div>

            <div className="botTile">
              <div className="botTileLabel">{COPY.tiles.heartbeat}</div>
              <div className="botTileValue">{!hasSelection ? "—" : hbAge == null ? "—" : `${fmtAge(hbAge)} ago`}</div>
            </div>

            <div className="botTile">
              <div className="botTileLabel">{isOpen ? COPY.tiles.market : COPY.tiles.nextOpen}</div>
              <div className="botTileValue">{isOpen ? COPY.market.openNow : nextOpenEpoch ? fmtTime(nextOpenEpoch) : "—"}</div>
            </div>

            <div className="botTile botTileFull">
              <div className="botTileLabel">{COPY.tiles.status}</div>
              <div className="botTileValue">{statusLine}</div>
              {hasSelection && message ? <div className="botPausedLine">{message}</div> : null}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={armConfirmOpen}
        title={COPY.modals.arm.title}
        onClose={() => setArmConfirmOpen(false)}
        footer={
          <>
            <button className="mBtn" type="button" onClick={() => setArmConfirmOpen(false)} disabled={busy}>
              {COPY.modals.arm.cancel}
            </button>
            <button className="mBtn mBtnPrimary" type="button" onClick={confirmArm} disabled={busy}>
              {COPY.modals.arm.confirm}
            </button>
          </>
        }
      >
        <div className="botModalStack">
          <div className="botModalRow">
            <span className="botModalLabel">{COPY.modals.arm.botLabel}</span>
            <span className="mono">{safeStr(selected, "—")}</span>
          </div>
          <div className="botModalHelper">{COPY.modals.arm.helper}</div>
          <div className="botModalRow">
            <span className="botModalLabel">{COPY.modals.arm.modeLabel}</span>
            <span className="mono">{mode}</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={startConfirmOpen}
        title={COPY.modals.start.title}
        onClose={() => setStartConfirmOpen(false)}
        footer={
          <>
            <button className="mBtn" type="button" onClick={() => setStartConfirmOpen(false)} disabled={busy}>
              {COPY.modals.start.cancel}
            </button>
            <button className="mBtn mBtnPrimary" type="button" onClick={confirmStart} disabled={busy}>
              {COPY.modals.start.confirm}
            </button>
          </>
        }
      >
        <div className="botModalStack">
          <div className="botModalRow">
            <span className="botModalLabel">{COPY.modals.start.botLabel}</span>
            <span className="mono">{safeStr(selected, "—")}</span>
          </div>

          <div className="botModalHelper">
            {COPY.modals.start.modePrefix} <span className="mono">{mode}</span> · {COPY.modals.start.helper}
          </div>

          {!isArmed ? <div className="botModalDanger">{COPY.modals.start.notArmed}</div> : null}
          {marketClosedBlocksStart ? <div className="botModalWarn">{COPY.modals.start.marketClosed}</div> : null}
        </div>
      </Modal>

      {/* ✅ UPDATED log modal: same event-row look as BotLogsCard "View all" */}
      <Modal
        open={logOpen}
        title={COPY.modals.log.title}
        onClose={() => setLogOpen(false)}
        footer={
          <button className="mBtn" type="button" onClick={() => setLogOpen(false)} disabled={logBusy}>
            {COPY.modals.log.close}
          </button>
        }
      >
        {logBusy ? (
          <div className="botModalLoading">{COPY.modals.log.loading}</div>
        ) : logItems.length === 0 ? (
          <div className="botModalLoading">{COPY.modals.log.empty}</div>
        ) : (
          <div style={{ display: "grid", gap: 10, maxHeight: "62vh", overflow: "auto", paddingRight: 6 }}>
            {logItems.map((it, idx) => {
              const sev = logSeverity(it);
              const headline = logMessageFor(it) || "Update";
              const action = safeStr(it?.event_type, "").replaceAll("_", " ") || "Event";

              return (
                <div key={idx} className={toneClass(sev)}>
                  <div className="blog-evtTop">
                    <div className="blog-evtLeft">
                      <div className="blog-evtTitle">{headline}</div>

                      <div className="blog-evtSub">
                        <span className="blog-evtChip">System</span>
                        <span className="blog-evtDot">•</span>
                        <span className="blog-evtChip blog-evtChip--soft">{action}</span>
                        <span className="blog-evtDot">•</span>
                        <span className="mMono">{it?.ts ? fmtTime(it.ts) : "—"}</span>
                      </div>
                    </div>

                    <div className="blog-evtRight">
                      <span className={`blog-level blog-level--${sev}`}>
                        {sev === "info" ? "OK" : sev === "warn" ? "WARN" : "ERROR"}
                      </span>
                    </div>
                  </div>

                  <div className="blog-evtDetails">
                    <details>
                      <summary>Raw log</summary>
                      <div className="blog-rawGrid">
                        <div className="blog-rawLabel">Level</div>
                        <div className="mMono">{safeStr(it?.level, "info").toUpperCase()}</div>

                        <div className="blog-rawLabel">Event</div>
                        <div className="mMono">{safeStr(it?.event_type, "—")}</div>

                        <div className="blog-rawLabel">Message</div>
                        <div>{headline}</div>

                        <div className="blog-rawLabel">Payload</div>
                        <pre className="mMono blog-pre">{it?.payload ? safeJson(it.payload) : "—"}</pre>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={riskOpen}
        title={COPY.modals.risk.title}
        onClose={() => setRiskOpen(false)}
        footer={
          <>
            <button className="mBtn" type="button" onClick={() => setRiskOpen(false)} disabled={riskBusy}>
              {COPY.modals.risk.cancel}
            </button>
            <button className="mBtn mBtnPrimary" type="button" onClick={saveRisk} disabled={riskBusy}>
              {COPY.modals.risk.save}
            </button>
          </>
        }
      >
        <div className="botRiskGrid">
          <label className="botRiskField">
            <div className="botRiskLabel">{COPY.modals.risk.fields.risk_per_trade.label}</div>
            <input
              className={`botInput ${riskTouched.risk_per_trade && riskErrors.risk_per_trade ? "botInputError" : ""}`}
              value={riskDraft.risk_per_trade}
              onChange={(e) => onRiskChange("risk_per_trade", e.target.value)}
              onBlur={() => onRiskBlur("risk_per_trade")}
              placeholder={COPY.modals.risk.fields.risk_per_trade.placeholder}
              inputMode="decimal"
            />
            {riskTouched.risk_per_trade && riskErrors.risk_per_trade ? (
              <div className="botFieldError" role="alert">
                {riskErrors.risk_per_trade}
              </div>
            ) : null}
          </label>

          <label className="botRiskField">
            <div className="botRiskLabel">{COPY.modals.risk.fields.max_trades_per_day.label}</div>
            <input
              className={`botInput ${riskTouched.max_trades_per_day && riskErrors.max_trades_per_day ? "botInputError" : ""}`}
              value={riskDraft.max_trades_per_day}
              onChange={(e) => onRiskChange("max_trades_per_day", e.target.value)}
              onBlur={() => onRiskBlur("max_trades_per_day")}
              placeholder={COPY.modals.risk.fields.max_trades_per_day.placeholder}
              inputMode="numeric"
            />
            {riskTouched.max_trades_per_day && riskErrors.max_trades_per_day ? (
              <div className="botFieldError" role="alert">
                {riskErrors.max_trades_per_day}
              </div>
            ) : null}
          </label>

          <label className="botRiskField">
            <div className="botRiskLabel">{COPY.modals.risk.fields.min_confidence.label}</div>
            <input
              className={`botInput ${riskTouched.min_confidence && riskErrors.min_confidence ? "botInputError" : ""}`}
              value={riskDraft.min_confidence}
              onChange={(e) => onRiskChange("min_confidence", e.target.value)}
              onBlur={() => onRiskBlur("min_confidence")}
              placeholder={COPY.modals.risk.fields.min_confidence.placeholder}
              inputMode="decimal"
            />
            {riskTouched.min_confidence && riskErrors.min_confidence ? (
              <div className="botFieldError" role="alert">
                {riskErrors.min_confidence}
              </div>
            ) : null}
          </label>

          {Object.keys(riskErrors || {}).length > 0 ? (
            <div className="botRiskHint" role="status" aria-live="polite">
              {COPY.modals.risk.validationHint}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
