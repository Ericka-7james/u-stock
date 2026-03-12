// frontend/src/hooks/bots/useBotControlCard.js

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeStr } from "../../../lib/format/botFormat.js";
import { apiGet, apiPost } from "../../../lib/api/botApi.js";

import botUnavailableSquirrel from "../../../assets/modal/bot-unavailable-squirrel.png";

import {
  ARM_GRACE_MS,
  DISARM_GRACE_MS,
  START_GRACE_MS,
  PAUSE_GRACE_MS,
  LAST_SELECTED_BOT_KEY,
  STATUS_THROTTLE_MS,
  POLL_TRANSITION_MS,
  POLL_IDLE_MS,
  LOG_POLL_MS,
} from "../botControlCard/botControlCard.constants.js";

import { apiGetWithFallback, apiPostWithFallback } from "../botControlCard/botControlCard.api.js";

import {
  asDict,
  toNumStr,
  nowMs,
  sleep,
  safeJson,
  getErrorMessage,
  logSeverity,
  toneClass,
  logMessageFor,
  readArmedFlag,
  normalizeStatusPayload,
  isRunningState,
  isWaitingState,
  runtimeToneFromEffective,
  runtimeLabelFromEffective,
  validateRiskDraft,
  normalizeAvailableBots,
  normalizeLogItems,
  isBotUnavailableError,
  buildStorageKey,
  readStoredBotId,
  writeStoredBotId,
  makePendingAction,
  isPendingForSelectedBot,
  shouldClearPendingAction,
  deriveDisplayEffectiveState,
} from "../botControlCard/botControlCard.helpers.js";

/**
 * IMPORTANT:
 * - No JSX in this hook.
 * - This hook owns state, derivation, polling, optimistic transition handling,
 *   and mutation handlers for BotControlCard.
 * - UI components should consume this hook and render only.
 */

export default function useBotControlCard({
  activeBotId,
  onActiveBotChange,
  onStartBot,
  onStopBot,
  COPY,
  storageScope = "",
}) {
  const storageKey = useMemo(() => buildStorageKey(LAST_SELECTED_BOT_KEY, storageScope), [storageScope]);

  const [available, setAvailable] = useState([]);
  const [availableLoaded, setAvailableLoaded] = useState(false);

  const [selected, setSelected] = useState(safeStr(activeBotId, ""));
  const [snapshot, setSnapshot] = useState(null);

  const [hardLoading, setHardLoading] = useState(false);
  const [softLoading, setSoftLoading] = useState(false);

  const [armBusy, setArmBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);

  const [optimisticArmed, setOptimisticArmed] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const [errModalOpen, setErrModalOpen] = useState(false);
  const [errModal, setErrModal] = useState(null);

  const [armConfirmOpen, setArmConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [logItems, setLogItems] = useState([]);

  const [riskOpen, setRiskOpen] = useState(false);
  const [riskBusy, setRiskBusy] = useState(false);
  const [riskDraft, setRiskDraft] = useState({
    risk_per_trade: "",
    max_trades_per_day: "",
    min_confidence: "",
  });
  const [riskTouched, setRiskTouched] = useState({
    risk_per_trade: false,
    max_trades_per_day: false,
    min_confidence: false,
  });
  const [riskErrors, setRiskErrors] = useState({});

  const [selectPromptOpen, setSelectPromptOpen] = useState(false);

  const loadedBotsRef = useRef(new Set());
  const initialStatusLoadedRef = useRef(false);
  const statusReqSeqRef = useRef(0);
  const statusAbortRef = useRef(null);
  const statusInFlightRef = useRef(false);
  const lastStatusFetchRef = useRef(0);
  const pollTimerRef = useRef(null);
  const pendingActionClearTimerRef = useRef(null);
  const lastUnavailableBotRef = useRef("");

  const selectPromptKey = useMemo(() => {
    const scope = String(storageScope || "").trim();
    return scope ? `ustock_select_bot_prompt_shown_v1:${scope}` : "ustock_select_bot_prompt_shown_v1";
  }, [storageScope]);

  const busy = useMemo(
    () => armBusy || startBusy || pauseBusy || riskBusy || hardLoading,
    [armBusy, startBusy, pauseBusy, riskBusy, hardLoading]
  );

  const hasSelection = useMemo(() => safeStr(selected, "") !== "", [selected]);

  const selectedMeta = useMemo(() => {
    const botId = safeStr(selected, "");
    if (!botId) return null;
    return (available || []).find((bot) => String(bot?.id || "") === botId) || null;
  }, [available, selected]);

  const mode = useMemo(() => {
    const m = String(snapshot?.mode || "paper").toLowerCase();
    return m === "live" ? "live" : "paper";
  }, [snapshot?.mode]);

  const intent = useMemo(() => safeStr(snapshot?.intent ?? snapshot?.desired_state, ""), [snapshot?.intent, snapshot?.desired_state]);
  const rawEff = useMemo(() => safeStr(snapshot?.effective_state, ""), [snapshot?.effective_state]);
  const desiredState = useMemo(() => safeStr(snapshot?.desired_state, ""), [snapshot?.desired_state]);
  const message = useMemo(() => safeStr(snapshot?.message, ""), [snapshot?.message]);
  const pausedReason = useMemo(() => safeStr(snapshot?.pausedReason ?? snapshot?.paused_reason, ""), [
    snapshot?.pausedReason,
    snapshot?.paused_reason,
  ]);

  const isOpen = useMemo(() => snapshot?.market?.is_open === true, [snapshot?.market?.is_open]);

  const nextOpenEpoch = useMemo(() => {
    const value = snapshot?.market?.next_open_epoch ?? snapshot?.nextOpenEpoch;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }, [snapshot?.market?.next_open_epoch, snapshot?.nextOpenEpoch]);

  const hbAge = useMemo(() => {
    const value =
      snapshot?.heartbeatAgeSec ??
      snapshot?.hb_age_seconds ??
      snapshot?.heartbeat_age ??
      snapshot?.heartbeat_age_seconds ??
      null;

    if (value == null) return null;

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }, [snapshot]);

  const eff = useMemo(() => {
    return deriveDisplayEffectiveState(rawEff, intent, desiredState, pendingAction, safeStr(selected, ""));
  }, [rawEff, intent, desiredState, pendingAction, selected]);

  const runtimeTone = useMemo(() => runtimeToneFromEffective(eff), [eff]);
  const runtimeLabel = useMemo(() => runtimeLabelFromEffective(eff, intent, pausedReason), [eff, intent, pausedReason]);

  const isArmed = useMemo(() => {
    if (typeof optimisticArmed === "boolean") return optimisticArmed;
    return readArmedFlag(snapshot);
  }, [snapshot, optimisticArmed]);

  const isRunningEff = useMemo(() => isRunningState(eff), [eff]);
  const isWaiting = useMemo(() => isWaitingState(eff), [eff]);

  const isStartPending = useMemo(() => {
    return isPendingForSelectedBot(pendingAction, safeStr(selected, "")) && pendingAction?.kind === "start";
  }, [pendingAction, selected]);

  const isPausePending = useMemo(() => {
    return isPendingForSelectedBot(pendingAction, safeStr(selected, "")) && pendingAction?.kind === "pause";
  }, [pendingAction, selected]);

  const isStarting = useMemo(() => startBusy || isStartPending, [startBusy, isStartPending]);

  const marketClosedBlocksStart = useMemo(() => {
    if (!hasSelection) return false;
    return snapshot?.market?.blocks_start === true;
  }, [hasSelection, snapshot]);

  const showMarketClosedNote = useMemo(() => {
    if (!hasSelection) return false;
    if (snapshot?.market?.show_note) return true;
    if (snapshot?.market?.is_open === false) return true;
    if (marketClosedBlocksStart) return true;
    if (pausedReason && pausedReason.toLowerCase().includes("market")) return true;
    return false;
  }, [hasSelection, snapshot, marketClosedBlocksStart, pausedReason]);

  const startBlockedReason = useMemo(() => {
    if (!hasSelection) return "";
    const reason = safeStr(snapshot?.market?.reason, "");
    if (reason) return reason;
    if (pausedReason && pausedReason.toLowerCase().includes("market")) return pausedReason;
    if (marketClosedBlocksStart) return "Start blocked by server.";
    if (snapshot?.market?.is_open === false) return "Market is closed.";
    return "";
  }, [hasSelection, snapshot, marketClosedBlocksStart, pausedReason]);

  const statusLine = useMemo(() => {
    if (!hasSelection) return "Select a bot to view status.";

    const parts = [];
    if (runtimeLabel) parts.push(runtimeLabel);
    if (mode) parts.push(mode.toUpperCase());

    const reasonCode = safeStr(snapshot?.reason_code, "");
    if (reasonCode) parts.push(reasonCode.replaceAll("_", " "));

    return parts.filter(Boolean).join(" · ");
  }, [hasSelection, runtimeLabel, mode, snapshot?.reason_code]);

  const canArm = useMemo(() => {
    return hasSelection && !armBusy && !startBusy && !pauseBusy && !isArmed;
  }, [hasSelection, armBusy, startBusy, pauseBusy, isArmed]);

  const canDisarm = useMemo(() => {
    return hasSelection && !armBusy && !startBusy && !pauseBusy && isArmed && !isRunningEff && !isWaiting && !isStartPending;
  }, [hasSelection, armBusy, startBusy, pauseBusy, isArmed, isRunningEff, isWaiting, isStartPending]);

  const canStart = useMemo(() => {
    if (!hasSelection) return false;
    if (startBusy || pauseBusy) return false;
    if (isStartPending || isPausePending) return false;
    if (!isArmed) return false;
    if (isRunningEff || isWaiting) return false;
    if (marketClosedBlocksStart) return false;
    return true;
  }, [
    hasSelection,
    startBusy,
    pauseBusy,
    isStartPending,
    isPausePending,
    isArmed,
    isRunningEff,
    isWaiting,
    marketClosedBlocksStart,
  ]);

  const canPause = useMemo(() => {
    return hasSelection && !pauseBusy && !startBusy && (isRunningEff || isWaiting || isStartPending);
  }, [hasSelection, pauseBusy, startBusy, isRunningEff, isWaiting, isStartPending]);

  const pollMs = useMemo(() => {
    if (!hasSelection) return 0;
    if (isRunningEff || isWaiting || isStartPending || isPausePending || startBusy || pauseBusy) {
      return POLL_TRANSITION_MS;
    }
    return POLL_IDLE_MS;
  }, [hasSelection, isRunningEff, isWaiting, isStartPending, isPausePending, startBusy, pauseBusy]);

  const fail = useCallback((title, body, action = null, image = null, subtitle = "") => {
    setErrModal({
      title: title || "Something went wrong",
      body: body || "Unexpected error.",
      subtitle: subtitle || "",
      image: image || null,
      action: action || null,
    });
    setErrModalOpen(true);
  }, []);

  const closeErrorModal = useCallback(() => {
    setErrModalOpen(false);
    setErrModal(null);
  }, []);

  const unselectBot = useCallback(
    (reason = "") => {
      if (statusAbortRef.current) {
        statusAbortRef.current.abort();
        statusAbortRef.current = null;
      }

      statusInFlightRef.current = false;
      statusReqSeqRef.current += 1;

      setSelected("");
      setSnapshot(null);
      setOptimisticArmed(null);
      setPendingAction(null);

      lastUnavailableBotRef.current = "";
      loadedBotsRef.current = new Set();
      initialStatusLoadedRef.current = false;

      setHardLoading(false);
      setSoftLoading(false);

      writeStoredBotId(storageKey, "");

      if (typeof onActiveBotChange === "function") {
        onActiveBotChange("");
      }

      setArmConfirmOpen(false);
      setStartConfirmOpen(false);
      setLogOpen(false);
      setRiskOpen(false);

      if (reason) {
        fail(COPY?.errors?.botUnavailableTitle || "Bot unavailable", reason, null, botUnavailableSquirrel);
      }
    },
    [COPY, fail, onActiveBotChange, storageKey]
  );

  const applySnapshot = useCallback(
    (data, botId) => {
      const selectedBotId = safeStr(botId || selected, "");
      if (!selectedBotId) return null;

      const normalized = normalizeStatusPayload(data);
      setSnapshot(normalized);
      loadedBotsRef.current.add(selectedBotId);
      initialStatusLoadedRef.current = true;

      if (lastUnavailableBotRef.current === selectedBotId) {
        lastUnavailableBotRef.current = "";
      }

      if (shouldClearPendingAction(pendingAction, normalized, selectedBotId)) {
        setPendingAction(null);
      }

      if (pendingAction?.kind === "arm" && pendingAction.botId === selectedBotId && readArmedFlag(normalized)) {
        setOptimisticArmed(null);
      }

      if (pendingAction?.kind === "disarm" && pendingAction.botId === selectedBotId && !readArmedFlag(normalized)) {
        setOptimisticArmed(null);
      }

      return normalized;
    },
    [pendingAction, selected]
  );

  const fetchAvailable = useCallback(async () => {
    try {
      const data = await apiGet("/api/bots/available", {});
      setAvailable(normalizeAvailableBots(data));
    } catch {
      setAvailable([]);
    } finally {
      setAvailableLoaded(true);
    }
  }, []);

  const fetchStatus = useCallback(
    async ({ force = false } = {}) => {
      const botId = safeStr(selected, "");
      if (!botId) return;

      const currentTime = nowMs();

      if (!force && currentTime - lastStatusFetchRef.current < STATUS_THROTTLE_MS) return;
      if (statusInFlightRef.current && !force) return;

      lastStatusFetchRef.current = currentTime;

      const hasLoadedThisBot = loadedBotsRef.current.has(botId);
      const isHard = !initialStatusLoadedRef.current && (force || !hasLoadedThisBot);

      const controller = new AbortController();
      statusAbortRef.current = controller;

      const requestSeq = ++statusReqSeqRef.current;
      statusInFlightRef.current = true;

      if (isHard) setHardLoading(true);
      else setSoftLoading(true);

      try {
        const data = await apiGet("/api/bots/status", { bot_id: botId }, { signal: controller.signal });

        if (controller.signal.aborted) return;
        if (requestSeq !== statusReqSeqRef.current) return;
        if (safeStr(selected, "") !== botId) return;

        applySnapshot(data, botId);
      } catch (err) {
        if (err?.name === "AbortError") return;

        if (isBotUnavailableError(err)) {
          if (requestSeq !== statusReqSeqRef.current) return;

          if (lastUnavailableBotRef.current !== botId) {
            lastUnavailableBotRef.current = botId;
            unselectBot(COPY?.errors?.botUnavailableMessage || `“${botId}” is not available yet.`);
          } else {
            setSelected("");
            setSnapshot(null);
            setOptimisticArmed(null);
            setPendingAction(null);
            writeStoredBotId(storageKey, "");
            if (typeof onActiveBotChange === "function") onActiveBotChange("");
          }
          return;
        }

        if (requestSeq !== statusReqSeqRef.current) return;

        fail("Failed to load bot status", getErrorMessage(err), { label: "Refresh", kind: "refresh" });
      } finally {
        statusInFlightRef.current = false;

        if (requestSeq === statusReqSeqRef.current) {
          if (isHard) setHardLoading(false);
          else setSoftLoading(false);
        }
      }
    },
    [selected, applySnapshot, fail, unselectBot, COPY, storageKey, onActiveBotChange]
  );

  const handleErrorAction = useCallback(
    async (action) => {
      const kind = action?.kind || errModal?.action?.kind;
      closeErrorModal();

      if (kind === "refresh") {
        await sleep(10);
        if (hasSelection) {
          await fetchStatus({ force: true });
        }
      }
    },
    [closeErrorModal, errModal, fetchStatus, hasSelection]
  );

  const fetchLog = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setLogBusy(true);

    try {
      const data = await apiGetWithFallback(
        ["/api/bots/log", "/api/bots/logs", "/api/bots/events"],
        { bot_id: botId, limit: 80, mode: "paper" }
      );

      const incoming = normalizeLogItems(data);

      const keyOf = (item) => {
        const eventId = String(item?.request_id || item?.event_id || item?.id || "").trim();
        if (eventId) return `id:${eventId}`;

        const ts = String(item?.ts ?? "");
        const action = String(item?.action ?? item?.event_type ?? "");
        const level = String(item?.level ?? item?.status ?? "");
        const msg = logMessageFor(item);

        return `fb:${ts}|${action}|${level}|${msg}`;
      };

      setLogItems((prev) => {
        const old = Array.isArray(prev) ? prev : [];
        if (!old.length) return incoming;

        const seen = new Set(old.map(keyOf));
        const newOnes = [];

        for (const item of incoming) {
          const key = keyOf(item);
          if (!seen.has(key)) {
            seen.add(key);
            newOnes.push(item);
          }
        }

        const merged = [...newOnes, ...old];
        return merged.slice(0, 240);
      });
    } catch (err) {
      fail("Failed to load logs", getErrorMessage(err));
    } finally {
      setLogBusy(false);
    }
  }, [selected, fail]);

  const fetchRisk = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setRiskBusy(true);

    try {
      const data = await apiGetWithFallback(
        ["/api/bots/risk", "/api/bots/risk_settings", "/api/bots/risk-controls"],
        { bot_id: botId }
      );

      const d = asDict(data);
      const next = {
        risk_per_trade: toNumStr(d.risk_per_trade ?? d.riskPerTrade ?? ""),
        max_trades_per_day: toNumStr(d.max_trades_per_day ?? d.maxTradesPerDay ?? ""),
        min_confidence: toNumStr(d.min_confidence ?? d.minConfidence ?? ""),
      };

      setRiskDraft(next);
      setRiskTouched({
        risk_per_trade: false,
        max_trades_per_day: false,
        min_confidence: false,
      });
      setRiskErrors({});
    } catch (err) {
      fail("Failed to load risk settings", getErrorMessage(err));
    } finally {
      setRiskBusy(false);
    }
  }, [selected, fail]);

  const onSelect = useCallback(
    (event) => {
      const value = safeStr(event?.target?.value, "");

      if (statusAbortRef.current) {
        statusAbortRef.current.abort();
        statusAbortRef.current = null;
      }

      statusInFlightRef.current = false;
      statusReqSeqRef.current += 1;
      initialStatusLoadedRef.current = false;

      if (!value) {
        setSelected("");
        setSnapshot(null);
        setOptimisticArmed(null);
        setPendingAction(null);

        lastUnavailableBotRef.current = "";
        loadedBotsRef.current = new Set();

        writeStoredBotId(storageKey, "");

        if (typeof onActiveBotChange === "function") {
          onActiveBotChange("");
        }

        return;
      }

      loadedBotsRef.current.delete(value);

      setSelected(value);
      setSnapshot(null);
      setOptimisticArmed(null);
      setPendingAction(null);

      writeStoredBotId(storageKey, value);

      if (typeof onActiveBotChange === "function") {
        onActiveBotChange(value);
      }
    },
    [onActiveBotChange, storageKey]
  );

  const openRisk = useCallback(async () => {
    if (!hasSelection) return;

    try {
      await fetchRisk();
      setRiskOpen(true);
    } catch {
      // fetchRisk already handles fail()
    }
  }, [hasSelection, fetchRisk]);

  const openLog = useCallback(async () => {
    if (!hasSelection) return;

    try {
      await fetchLog();
      setLogOpen(true);
    } catch {
      // fetchLog already handles fail()
    }
  }, [hasSelection, fetchLog]);

  const closeLog = useCallback(() => setLogOpen(false), []);
  const closeRisk = useCallback(() => setRiskOpen(false), []);

  const requestArm = useCallback(() => {
    if (!canArm) return;
    setArmConfirmOpen(true);
  }, [canArm]);

  const confirmArm = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setArmBusy(true);

    try {
      const response = await apiPost("/api/bots/arm", { bot_id: botId });

      setOptimisticArmed(true);
      setPendingAction(makePendingAction("arm", botId, ARM_GRACE_MS));
      setArmConfirmOpen(false);

      if (response && typeof response === "object") {
        applySnapshot(response, botId);
      }

      await sleep(800);
      await fetchStatus({ force: true });
    } catch (err) {
      setOptimisticArmed(null);
      setPendingAction(null);
      fail("Failed to arm bot", getErrorMessage(err));
    } finally {
      setArmBusy(false);
    }
  }, [selected, applySnapshot, fetchStatus, fail]);

  const doDisarm = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;
    if (!canDisarm) return;

    setArmBusy(true);

    try {
      const response = await apiPost("/api/bots/disarm", { bot_id: botId });

      setOptimisticArmed(false);
      setPendingAction(makePendingAction("disarm", botId, DISARM_GRACE_MS));

      if (response && typeof response === "object") {
        applySnapshot(response, botId);
      }

      await sleep(800);
      await fetchStatus({ force: true });
    } catch (err) {
      setOptimisticArmed(null);
      setPendingAction(null);
      fail("Failed to disarm bot", getErrorMessage(err));
    } finally {
      setArmBusy(false);
    }
  }, [selected, canDisarm, applySnapshot, fetchStatus, fail]);

  const requestStart = useCallback(() => {
    if (!canStart) return;
    setStartConfirmOpen(true);
  }, [canStart]);

  const confirmStart = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setStartBusy(true);

    try {
      const response =
        typeof onStartBot === "function"
          ? await onStartBot(botId)
          : await apiPost("/api/bots/start", { bot_id: botId });

      setStartConfirmOpen(false);
      setOptimisticArmed(true);
      setPendingAction(makePendingAction("start", botId, START_GRACE_MS));

      if (response && typeof response === "object") {
        applySnapshot(response, botId);
      }

      await sleep(1500);
      await fetchStatus({ force: true });
    } catch (err) {
      setPendingAction(null);
      fail("Failed to start bot", getErrorMessage(err));
    } finally {
      setStartBusy(false);
    }
  }, [selected, onStartBot, applySnapshot, fetchStatus, fail]);

  const doPause = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;
    if (!canPause) return;

    setPauseBusy(true);

    try {
      const response =
        typeof onStopBot === "function"
          ? await onStopBot(botId)
          : await apiPost("/api/bots/stop", { bot_id: botId });

      setPendingAction(makePendingAction("pause", botId, PAUSE_GRACE_MS));

      if (response && typeof response === "object") {
        applySnapshot(response, botId);
      }

      await sleep(800);
      await fetchStatus({ force: true });
    } catch (err) {
      setPendingAction(null);
      fail("Failed to pause bot", getErrorMessage(err));
    } finally {
      setPauseBusy(false);
    }
  }, [selected, canPause, onStopBot, applySnapshot, fetchStatus, fail]);

  const onRiskChange = useCallback((key, value) => {
    setRiskDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onRiskBlur = useCallback(
    (key) => {
      setRiskTouched((prev) => ({ ...prev, [key]: true }));

      setRiskErrors((prev) => {
        const next = { ...prev };
        const errs = validateRiskDraft({ ...riskDraft, [key]: riskDraft[key] });

        if (errs[key]) next[key] = errs[key];
        else delete next[key];

        return next;
      });
    },
    [riskDraft]
  );

  const saveRisk = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setRiskTouched({
      risk_per_trade: true,
      max_trades_per_day: true,
      min_confidence: true,
    });

    const errs = validateRiskDraft(riskDraft);
    setRiskErrors(errs);

    if (Object.keys(errs).length > 0) return;

    setRiskBusy(true);

    try {
      await apiPostWithFallback(
        ["/api/bots/risk", "/api/bots/risk_settings", "/api/bots/risk-controls"],
        {
          bot_id: botId,
          risk_per_trade: Number(riskDraft.risk_per_trade),
          max_trades_per_day: Number(riskDraft.max_trades_per_day),
          min_confidence: Number(riskDraft.min_confidence),
        }
      );

      setRiskOpen(false);
      await fetchStatus({ force: true });
    } catch (err) {
      fail("Failed to save risk settings", getErrorMessage(err));
    } finally {
      setRiskBusy(false);
    }
  }, [selected, riskDraft, fetchStatus, fail]);

  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    const sel = safeStr(selected, "");

    if (propId) return;
    if (sel) return;

    const stored = readStoredBotId(storageKey);
    if (!stored) return;

    setSelected(stored);

    if (typeof onActiveBotChange === "function") {
      onActiveBotChange(stored);
    }

    loadedBotsRef.current.delete(stored);
  }, [activeBotId, selected, storageKey, onActiveBotChange]);

  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    if (!propId) return;

    setSelected((prev) => (prev ? prev : propId));
    writeStoredBotId(storageKey, propId);
  }, [activeBotId, storageKey]);

  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    const sel = safeStr(selected, "");
    const hasBotsLoaded = Array.isArray(available) && available.length > 0;

    if (sel || propId) {
      if (selectPromptOpen) setSelectPromptOpen(false);
      return;
    }

    if (!hasBotsLoaded) return;

    try {
      const alreadyShown = sessionStorage.getItem(selectPromptKey) === "1";
      if (alreadyShown) return;
      sessionStorage.setItem(selectPromptKey, "1");
    } catch {
      // Ignore sessionStorage failures.
    }

    setSelectPromptOpen(true);
  }, [activeBotId, selected, available, selectPromptOpen, selectPromptKey]);

  useEffect(() => {
    if (!availableLoaded) return;

    const botId = safeStr(selected, "");
    if (!botId) return;

    const stillExists = (available || []).some((bot) => String(bot?.id || "") === botId);

    if (!stillExists) {
      unselectBot(COPY?.errors?.botUnavailableMessage || `“${botId}” is not available.`);
    }
  }, [availableLoaded, available, selected, unselectBot, COPY]);

  useEffect(() => {
    if (pendingActionClearTimerRef.current) {
      clearTimeout(pendingActionClearTimerRef.current);
      pendingActionClearTimerRef.current = null;
    }

    if (!pendingAction) return;

    const msRemaining = Math.max(0, pendingAction.until - nowMs());

    pendingActionClearTimerRef.current = setTimeout(() => {
      setPendingAction((current) => {
        if (!current) return null;
        if (current.until <= nowMs()) return null;
        return null;
      });
    }, msRemaining + 20);

    return () => {
      if (pendingActionClearTimerRef.current) {
        clearTimeout(pendingActionClearTimerRef.current);
        pendingActionClearTimerRef.current = null;
      }
    };
  }, [pendingAction]);

  useEffect(() => {
    if (!pendingAction || !selected) return;
    if (pendingAction.botId !== selected) return;

    if (pendingAction.kind === "arm" || pendingAction.kind === "disarm") {
      if (pendingAction.until <= nowMs()) {
        setOptimisticArmed(null);
      }
    }
  }, [pendingAction, selected]);

  useEffect(() => {
    fetchAvailable();
  }, [fetchAvailable]);

  useEffect(() => {
    if (!hasSelection) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    fetchStatus({ force: true });

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    pollTimerRef.current = setInterval(() => {
      fetchStatus({ force: false });
    }, pollMs);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [hasSelection, selected, fetchStatus, pollMs]);

  useEffect(() => {
    if (!logOpen) return;

    const timer = setInterval(() => {
      fetchLog();
    }, LOG_POLL_MS);

    return () => clearInterval(timer);
  }, [logOpen, fetchLog]);

  useEffect(() => {
    return () => {
      if (statusAbortRef.current) {
        statusAbortRef.current.abort();
        statusAbortRef.current = null;
      }

      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      if (pendingActionClearTimerRef.current) {
        clearTimeout(pendingActionClearTimerRef.current);
        pendingActionClearTimerRef.current = null;
      }

      statusInFlightRef.current = false;
    };
  }, []);

  return {
    errModalOpen,
    errModal,
    closeErrorModal,
    handleErrorAction,

    hardLoading,
    softLoading,

    available,
    selected,
    selectedMeta,
    hasSelection,
    onSelect,

    runtimeTone,
    runtimeLabel,
    isArmed,

    busy,
    armBusy,
    startBusy,
    pauseBusy,
    isRunningEff,
    isWaiting,
    isStarting,
    canDisarm,
    canArm,
    canStart,
    canPause,

    marketClosedBlocksStart,

    openLog,
    openRisk,
    doDisarm,
    doPause,
    requestArm,
    requestStart,

    showMarketClosedNote,
    startBlockedReason,
    nextOpenEpoch,

    intent,
    eff,
    desiredState,
    hbAge,
    isOpen,
    statusLine,
    message,
    pausedReason,

    armConfirmOpen,
    setArmConfirmOpen,
    confirmArm,

    startConfirmOpen,
    setStartConfirmOpen,
    confirmStart,

    logOpen,
    closeLog,
    logBusy,
    logItems,
    logSeverity,
    toneClass,
    logMessageFor,
    safeJson,

    riskOpen,
    closeRisk,
    riskBusy,
    riskDraft,
    riskTouched,
    riskErrors,
    onRiskChange,
    onRiskBlur,
    saveRisk,

    mode,

    selectPromptOpen,
    setSelectPromptOpen,
  };
}