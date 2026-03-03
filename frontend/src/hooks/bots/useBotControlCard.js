// frontend/src/hooks/bots/useBotControlCard.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../lib/api/botApi.js";
import { safeStr } from "../../lib/format/botFormat.js";

import botUnavailableSquirrel from "../../assets/modal/bot-unavailable-squirrel.png";

/**
 * IMPORTANT: No JSX in here.
 * Hooks return state + handlers only.
 */

// ---------- small helpers ----------
function _asDict(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}
function _asList(x) {
  return Array.isArray(x) ? x : [];
}
function _toNumStr(x) {
  return String(x ?? "").trim();
}
function _nowMs() {
  return Date.now();
}
function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function logSeverity(it) {
  const lvl = String(it?.level || "").toLowerCase();
  if (lvl === "error") return "error";
  if (lvl === "warn" || lvl === "warning") return "warn";
  return "info";
}

function toneClass(sev) {
  if (sev === "error") return "blog-evt blog-evt--error";
  if (sev === "warn") return "blog-evt blog-evt--warn";
  return "blog-evt";
}

function logMessageFor(it) {
  const p = it?.payload;
  if (typeof p?.message === "string" && p.message.trim()) return p.message.trim();
  if (typeof it?.message === "string" && it.message.trim()) return it.message.trim();
  if (typeof p?.error === "string" && p.error.trim()) return p.error.trim();
  return "";
}

function runtimeToneFromEffective(eff) {
  const s = String(eff || "").toLowerCase();
  if (!s) return "neutral";
  if (s.includes("running")) return "pos";
  if (s.includes("waiting")) return "warn";
  if (s.includes("paused") || s.includes("stopped") || s.includes("idle")) return "neutral";
  if (s.includes("error") || s.includes("failed")) return "neg";
  return "neutral";
}

function runtimeLabelFromEffective(eff, intent) {
  const e = String(eff || "").toLowerCase();
  const i = String(intent || "").toLowerCase();

  if (e === "waiting_for_market") return "Waiting";
  if (e.includes("waiting")) return "Waiting";
  if (e.includes("running")) return "Running";
  if (e.includes("paused")) return "Paused";
  if (e.includes("stopped")) return "Stopped";
  if (e.includes("idle")) return "Idle";
  if (e.includes("error") || e.includes("failed")) return "Error";

  if (i === "running") return "Running";
  if (i === "paused") return "Paused";
  if (i === "stopped") return "Stopped";

  return "Unknown";
}

function validateRiskDraft(draft) {
  const errors = {};

  const rpt = Number(draft.risk_per_trade);
  if (!Number.isFinite(rpt) || rpt <= 0 || rpt > 0.2) {
    errors.risk_per_trade = "Enter a number between 0 and 0.20";
  }

  const mtd = Number(draft.max_trades_per_day);
  if (!Number.isFinite(mtd) || !Number.isInteger(mtd) || mtd <= 0 || mtd > 200) {
    errors.max_trades_per_day = "Enter a whole number between 1 and 200";
  }

  const mc = Number(draft.min_confidence);
  if (!Number.isFinite(mc) || mc < 0 || mc > 1) {
    errors.min_confidence = "Enter a number between 0 and 1";
  }

  return errors;
}

// Normalize “available bots” from many possible backend shapes
function normalizeAvailableBots(data) {
  const root = _asDict(data);
  const raw = root.items ?? root.bots ?? root.available ?? root.bot_ids ?? root.botIds ?? data;
  const items = _asList(raw);

  const normalized = items
    .map((b) => {
      if (typeof b === "string") {
        const id = b.trim();
        return id ? { id, name: id, description: "" } : null;
      }
      const o = _asDict(b);
      const id = String(o.id ?? o.bot_id ?? o.botId ?? o.key ?? "").trim();
      if (!id) return null;
      return {
        id,
        name: String(o.name ?? o.label ?? id),
        description: String(o.description ?? o.desc ?? ""),
      };
    })
    .filter(Boolean);

  // de-dupe
  const seen = new Set();
  return normalized.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

// Detect “bot unavailable / not wired” from backend errors
function isBotUnavailableError(err) {
  const status = Number(err?.status || 0);
  const msg = String(err?.message || "").toLowerCase();
  const detailMsg = String(err?.detail?.message || err?.detail?.detail || "").toLowerCase();

  const blob = `${msg} ${detailMsg}`.trim();

  // Only treat as bot-unavailable if the server explicitly indicates that.
  const explicit =
    blob.includes("unknown bot") ||
    blob.includes("bot not registered") ||
    blob.includes("not wired") ||
    blob.includes("not hooked") ||
    blob.includes("bot unavailable") ||
    blob.includes("bot not found");

  // A plain 404 from risk/log routes should NOT unselect the bot.
  if (status === 404) return explicit;

  // Also allow explicit language regardless of status.
  if (explicit) return true;

  return false;
}

function normalizeStatusPayload(data) {
  const root = _asDict(data);

  // allow common nesting patterns
  const status = _asDict(root.status) || _asDict(root.snapshot) || _asDict(root.data) || root;

  // merge so both root and status fields are available
  const merged = { ...root, ...status };

  // keep market merged too
  merged.market = _asDict(status.market) || _asDict(root.market) || {};

  return merged;
}

function _truthy(v) {
  if (v === true) return true;
  if (v === 1) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "armed" || s === "1" || s === "yes";
}

function readArmedFlag(snap) {
  if (!snap || typeof snap !== "object") return false;

  // direct flags
  if (_truthy(snap.armed)) return true;
  if (_truthy(snap.is_armed)) return true;
  if (_truthy(snap.isArmed)) return true;

  // common state strings
  const armedState = String(snap.armed_state ?? snap.armedState ?? snap.arm_state ?? "")
    .trim()
    .toLowerCase();
  if (armedState === "armed") return true;

  return false;
}

function isNotFoundError(err) {
  const status = Number(err?.status || 0);
  if (status === 404) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("404") || msg.includes("not found");
}

async function apiGetWithFallback(paths, params) {
  let lastErr = null;

  for (const p of paths) {
    try {
      return await apiGet(p, params);
    } catch (e) {
      lastErr = e;
      if (!isNotFoundError(e)) break; // non-404 should not fall through
    }
  }

  throw lastErr;
}

async function apiPostWithFallback(paths, body) {
  let lastErr = null;

  for (const p of paths) {
    try {
      return await apiPost(p, body);
    } catch (e) {
      lastErr = e;
      if (!isNotFoundError(e)) break;
    }
  }

  throw lastErr;
}

// ---------- persistence helpers ----------
const LAST_SELECTED_BOT_KEY = "ustock:last_bot_id_v1";

function buildStorageKey(storageScope) {
  const scope = String(storageScope || "").trim();
  return scope ? `${LAST_SELECTED_BOT_KEY}:${scope}` : LAST_SELECTED_BOT_KEY;
}

function readStoredBotId(storageKey) {
  try {
    const v = window.localStorage.getItem(storageKey);
    const s = String(v || "").trim();
    return s || "";
  } catch {
    return "";
  }
}

function writeStoredBotId(storageKey, botId) {
  try {
    const s = String(botId || "").trim();
    if (!s) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, s);
  } catch {
    // ignore
  }
}

// ---------- hook ----------
export default function useBotControlCard({
  activeBotId,
  onActiveBotChange,
  onStartBot,
  onStopBot,
  COPY,
  storageScope = "",
}) {
  const storageKey = useMemo(() => buildStorageKey(storageScope), [storageScope]);

  const [available, setAvailable] = useState([]);
  const [availableLoaded, setAvailableLoaded] = useState(false);

  const [selected, setSelected] = useState(safeStr(activeBotId, ""));
  const [snapshot, setSnapshot] = useState(null);

  const [hardLoading, setHardLoading] = useState(false);
  const [softLoading, setSoftLoading] = useState(false);

  const loadedBotsRef = useRef(new Set());
  const initialStatusLoadedRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

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
  const selectPromptKey = useMemo(() => {
    const scope = String(storageScope || "").trim();
    return scope ? `ustock_select_bot_prompt_shown_v1:${scope}` : "ustock_select_bot_prompt_shown_v1";
  }, [storageScope]);

  const pollTimer = useRef(null);
  const lastStatusFetch = useRef(0);

  const lastUnavailableBotRef = useRef("");

  // ✅ Restore selection from localStorage (only if parent didn’t already pick one)
  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    const sel = safeStr(selected, "");

    if (propId) return;
    if (sel) return;

    const stored = readStoredBotId(storageKey);
    if (!stored) return;

    setSelected(stored);
    if (typeof onActiveBotChange === "function") onActiveBotChange(stored);

    loadedBotsRef.current.delete(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBotId, storageKey]);

  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    if (!propId) return;

    setSelected((prev) => (prev ? prev : propId));
    writeStoredBotId(storageKey, propId);
  }, [activeBotId, storageKey]);

  const hasSelection = useMemo(() => safeStr(selected, "") !== "", [selected]);

  const selectedMeta = useMemo(() => {
    const bid = safeStr(selected, "");
    if (!bid) return null;
    return (available || []).find((b) => String(b?.id || "") === bid) || null;
  }, [available, selected]);

  const mode = useMemo(() => {
    const m = String(snapshot?.mode || "paper").toLowerCase();
    return m === "live" ? "live" : "paper";
  }, [snapshot?.mode]);

  const intent = useMemo(() => safeStr(snapshot?.intent, ""), [snapshot?.intent]);
  const eff = useMemo(() => safeStr(snapshot?.effective_state, ""), [snapshot?.effective_state]);
  const desiredState = useMemo(() => safeStr(snapshot?.desired_state, ""), [snapshot?.desired_state]);
  const message = useMemo(() => safeStr(snapshot?.message, ""), [snapshot?.message]);

  const isOpen = useMemo(() => snapshot?.market?.is_open === true, [snapshot?.market?.is_open]);
  const nextOpenEpoch = useMemo(() => {
    const v = snapshot?.market?.next_open_epoch;
    return Number.isFinite(Number(v)) ? Number(v) : null;
  }, [snapshot?.market?.next_open_epoch]);

  const hbAge = useMemo(() => {
    const v = snapshot?.hb_age_seconds ?? snapshot?.heartbeat_age ?? snapshot?.heartbeat_age_seconds ?? null;
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, [snapshot]);

  const runtimeTone = useMemo(() => runtimeToneFromEffective(eff), [eff]);
  const runtimeLabel = useMemo(() => runtimeLabelFromEffective(eff, intent), [eff, intent]);

  const isArmed = useMemo(() => readArmedFlag(snapshot), [snapshot]);

  const isRunningEff = useMemo(() => String(eff || "").toLowerCase().includes("running"), [eff]);
  const isWaiting = useMemo(() => String(eff || "").toLowerCase().includes("waiting"), [eff]);

  const canPause = useMemo(
    () => hasSelection && (isRunningEff || isWaiting || isStarting),
    [hasSelection, isRunningEff, isWaiting, isStarting]
  );

  // ✅ CHANGE: Market hours should NOT block Start. We only block if server explicitly says so.
  const marketClosedBlocksStart = useMemo(() => {
    if (!hasSelection) return false;
    return snapshot?.market?.blocks_start === true;
  }, [hasSelection, snapshot]);

  // ✅ Keep note informational. Still shows when market is closed (but doesn’t block).
  const showMarketClosedNote = useMemo(() => {
    if (!hasSelection) return false;
    if (snapshot?.market?.show_note) return true;
    if (snapshot?.market?.is_open === false) return true; // informational
    if (marketClosedBlocksStart) return true; // explicit block
    return false;
  }, [hasSelection, snapshot, marketClosedBlocksStart]);

  const startBlockedReason = useMemo(() => {
    if (!hasSelection) return "";
    const r = safeStr(snapshot?.market?.reason, "");
    if (r) return r;
    if (marketClosedBlocksStart) return "Start blocked by server.";
    if (snapshot?.market?.is_open === false) return "Market is closed."; // informational
    return "";
  }, [hasSelection, snapshot, marketClosedBlocksStart]);

  const statusLine = useMemo(() => {
    if (!hasSelection) return "Select a bot to view status.";
    const parts = [];
    if (runtimeLabel) parts.push(runtimeLabel);
    if (mode) parts.push(mode.toUpperCase());
    if (snapshot?.reason_code) parts.push(String(snapshot.reason_code).replaceAll("_", " "));
    return parts.filter(Boolean).join(" · ");
  }, [hasSelection, runtimeLabel, mode, snapshot?.reason_code]);

  const canArm = useMemo(() => hasSelection && !busy && !isArmed, [hasSelection, busy, isArmed]);

  const canDisarm = useMemo(
    () => hasSelection && !busy && isArmed && !isRunningEff && !isWaiting && !isStarting,
    [hasSelection, busy, isArmed, isRunningEff, isWaiting, isStarting]
  );

  // ✅ CHANGE: remove marketClosedBlocksStart from canStart gating
  const canStart = useMemo(() => {
    if (!hasSelection) return false;
    if (busy || isStarting) return false;
    if (!isArmed) return false;
    if (isRunningEff || isWaiting) return false;

    // Market hours do NOT block start. Server may still deny on /start if it wants.
    // We only block if the server explicitly sets blocks_start.
    if (marketClosedBlocksStart) return false;

    return true;
  }, [hasSelection, busy, isStarting, isArmed, isRunningEff, isWaiting, marketClosedBlocksStart]);

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
      setSelected("");
      setSnapshot(null);
      lastUnavailableBotRef.current = "";

      writeStoredBotId(storageKey, "");

      loadedBotsRef.current = new Set();
      setHardLoading(false);
      setSoftLoading(false);

      if (typeof onActiveBotChange === "function") onActiveBotChange("");

      setArmConfirmOpen(false);
      setStartConfirmOpen(false);
      setLogOpen(false);
      setRiskOpen(false);

      if (reason) {
        fail(COPY?.errors?.botUnavailableTitle || "Bot unavailable", reason, null, botUnavailableSquirrel);
      }
    },
    [onActiveBotChange, fail, COPY, storageKey]
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
      const bid = safeStr(selected, "");
      if (!bid) return;

      const now = _nowMs();
      if (!force && now - lastStatusFetch.current < 600) return;
      lastStatusFetch.current = now;

      const hasLoadedThisBot = loadedBotsRef.current.has(bid);
      const isHard = !initialStatusLoadedRef.current && (force || !hasLoadedThisBot);

      if (isHard) setHardLoading(true);
      else setSoftLoading(true);

      try {
        const data = await apiGet("/api/bots/status", { bot_id: bid });
        setSnapshot(normalizeStatusPayload(data));
        loadedBotsRef.current.add(bid);

        initialStatusLoadedRef.current = true;

        if (lastUnavailableBotRef.current === bid) lastUnavailableBotRef.current = "";
      } catch (e) {
        const msg = String(e?.message || e || "Unknown error");

        if (isBotUnavailableError(e)) {
          if (lastUnavailableBotRef.current !== bid) {
            lastUnavailableBotRef.current = bid;
            unselectBot(COPY?.errors?.botUnavailableMessage || `“${bid}” is not available yet.`);
          } else {
            setSelected("");
            writeStoredBotId(storageKey, "");
            if (typeof onActiveBotChange === "function") onActiveBotChange("");
          }
          return;
        }

        fail("Failed to load bot status", msg, { label: "Refresh", kind: "refresh" });
      } finally {
        if (isHard) setHardLoading(false);
        else setSoftLoading(false);
      }
    },
    [selected, fail, unselectBot, onActiveBotChange, COPY, storageKey]
  );

  const handleErrorAction = useCallback(
    async (action) => {
      const kind = action?.kind || errModal?.action?.kind;
      closeErrorModal();
      if (kind === "refresh") {
        await _sleep(10);
        if (hasSelection) await fetchStatus({ force: true });
      }
    },
    [errModal, closeErrorModal, hasSelection, fetchStatus]
  );

  const fetchLog = useCallback(async () => {
    const bid = safeStr(selected, "");
    if (!bid) return;

    setLogBusy(true);

    try {
      const data = await apiGetWithFallback(
        ["/api/bots/log", "/api/bots/logs", "/api/bots/events"],
        { bot_id: bid, limit: 80, mode: "paper" }
      );
      const incoming = _asList(data?.items || data || []).filter((x) => x && typeof x === "object");

      const keyOf = (it) => {
        const eid = String(it?.event_id || it?.id || "").trim();
        if (eid) return `eid:${eid}`;
        const ts = String(it?.ts ?? "");
        const et = String(it?.event_type ?? "");
        const lvl = String(it?.level ?? "");
        const msg =
          typeof it?.payload?.message === "string"
            ? it.payload.message.trim()
            : typeof it?.message === "string"
              ? it.message.trim()
              : "";
        return `fb:${ts}|${et}|${lvl}|${msg}`;
      };

      setLogItems((prev) => {
        const old = Array.isArray(prev) ? prev : [];
        if (!old.length) return incoming;

        const seen = new Set(old.map(keyOf));

        const newOnes = [];
        for (const it of incoming) {
          const k = keyOf(it);
          if (!seen.has(k)) {
            seen.add(k);
            newOnes.push(it);
          }
        }

        const merged = [...newOnes, ...old];
        return merged.slice(0, 240);
      });
    } catch (e) {
      fail("Failed to load logs", String(e?.message || e || "Unknown error"));
    } finally {
      setLogBusy(false);
    }
  }, [selected, fail]);

  const fetchRisk = useCallback(async () => {
    const bid = safeStr(selected, "");
    if (!bid) return;

    setRiskBusy(true);
    try {
      const data = await apiGetWithFallback(
        ["/api/bots/risk", "/api/bots/risk_settings", "/api/bots/risk-controls"],
        { bot_id: bid }
      );
      const d = _asDict(data);
      const next = {
        risk_per_trade: _toNumStr(d.risk_per_trade ?? d.riskPerTrade ?? ""),
        max_trades_per_day: _toNumStr(d.max_trades_per_day ?? d.maxTradesPerDay ?? ""),
        min_confidence: _toNumStr(d.min_confidence ?? d.minConfidence ?? ""),
      };
      setRiskDraft(next);
      setRiskTouched({ risk_per_trade: false, max_trades_per_day: false, min_confidence: false });
      setRiskErrors({});
    } catch (e) {
      fail("Failed to load risk settings", String(e?.message || e || "Unknown error"));
    } finally {
      setRiskBusy(false);
    }
  }, [selected, fail]);

  const onSelect = useCallback(
    (e) => {
      const v = safeStr(e?.target?.value, "");

      if (!v) {
        setSelected("");
        setSnapshot(null);
        lastUnavailableBotRef.current = "";

        loadedBotsRef.current = new Set();
        writeStoredBotId(storageKey, "");

        if (typeof onActiveBotChange === "function") onActiveBotChange("");
        return;
      }

      loadedBotsRef.current.delete(v);

      setSelected(v);
      writeStoredBotId(storageKey, v);

      if (typeof onActiveBotChange === "function") onActiveBotChange(v);
    },
    [onActiveBotChange, storageKey]
  );

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
      // ignore
    }

    setSelectPromptOpen(true);
  }, [activeBotId, selected, available, selectPromptOpen, selectPromptKey]);

  useEffect(() => {
    if (!availableLoaded) return;

    const bid = safeStr(selected, "");
    if (!bid) return;

    const stillExists = (available || []).some((b) => String(b?.id || "") === bid);

    if (!stillExists) {
      unselectBot(COPY?.errors?.botUnavailableMessage || `“${bid}” is not available.`);
    }
  }, [availableLoaded, available, selected, unselectBot, COPY]);

  const openRisk = useCallback(async () => {
    if (!hasSelection) return;
    try {
      await fetchRisk();
      setRiskOpen(true);
    } catch {
      // fetchRisk already calls fail()
    }
  }, [hasSelection, fetchRisk]);

  const openLog = useCallback(async () => {
    if (!hasSelection) return;
    try {
      await fetchLog();
      setLogOpen(true);
    } catch {
      // fetchLog already calls fail()
    }
  }, [hasSelection, fetchLog]);

  const closeLog = useCallback(() => setLogOpen(false), []);
  const closeRisk = useCallback(() => setRiskOpen(false), []);

  const requestArm = useCallback(() => {
    if (!canArm) return;
    setArmConfirmOpen(true);
  }, [canArm]);

  const confirmArm = useCallback(async () => {
    const bid = safeStr(selected, "");
    if (!bid) return;

    setBusy(true);
    try {
      await apiPost("/api/bots/arm", { bot_id: bid });
      setArmConfirmOpen(false);

      await fetchStatus({ force: true });
      await _sleep(250);
      await fetchStatus({ force: true });
    } catch (e) {
      fail("Failed to arm bot", String(e?.message || e || "Unknown error"));
    } finally {
      setBusy(false);
    }
  }, [selected, fetchStatus, fail]);

  const doDisarm = useCallback(async () => {
    const bid = safeStr(selected, "");
    if (!bid) return;
    if (!canDisarm) return;

    setBusy(true);
    try {
      await apiPost("/api/bots/disarm", { bot_id: bid });
      await fetchStatus({ force: true });
    } catch (e) {
      fail("Failed to disarm bot", String(e?.message || e || "Unknown error"));
    } finally {
      setBusy(false);
    }
  }, [selected, canDisarm, fetchStatus, fail]);

  const requestStart = useCallback(() => {
    if (!canStart) return;
    setStartConfirmOpen(true);
  }, [canStart]);

  const confirmStart = useCallback(async () => {
    const bid = safeStr(selected, "");
    if (!bid) return;

    setIsStarting(true);
    setBusy(true);
    try {
      if (typeof onStartBot === "function") await onStartBot(bid);
      else await apiPost("/api/bots/start", { bot_id: bid });

      setStartConfirmOpen(false);
      await fetchStatus({ force: true });
    } catch (e) {
      fail("Failed to start bot", String(e?.message || e || "Unknown error"));
    } finally {
      setBusy(false);
      setIsStarting(false);
    }
  }, [selected, onStartBot, fetchStatus, fail]);

  const doPause = useCallback(async () => {
    const bid = safeStr(selected, "");
    if (!bid) return;
    if (!canPause) return;

    setBusy(true);
    try {
      if (typeof onStopBot === "function") await onStopBot(bid);
      else await apiPost("/api/bots/stop", { bot_id: bid });

      await fetchStatus({ force: true });
    } catch (e) {
      fail("Failed to pause bot", String(e?.message || e || "Unknown error"));
    } finally {
      setBusy(false);
    }
  }, [selected, canPause, onStopBot, fetchStatus, fail]);

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
    const bid = safeStr(selected, "");
    if (!bid) return;

    setRiskTouched({ risk_per_trade: true, max_trades_per_day: true, min_confidence: true });

    const errs = validateRiskDraft(riskDraft);
    setRiskErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setRiskBusy(true);
    try {
      await apiPostWithFallback(["/api/bots/risk", "/api/bots/risk_settings", "/api/bots/risk-controls"], {
        bot_id: bid,
        risk_per_trade: Number(riskDraft.risk_per_trade),
        max_trades_per_day: Number(riskDraft.max_trades_per_day),
        min_confidence: Number(riskDraft.min_confidence),
      });

      setRiskOpen(false);
      await fetchStatus({ force: true });
    } catch (e) {
      fail("Failed to save risk settings", String(e?.message || e || "Unknown error"));
    } finally {
      setRiskBusy(false);
    }
  }, [selected, riskDraft, fetchStatus, fail]);

  useEffect(() => {
    fetchAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasSelection) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    fetchStatus({ force: true });

    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    pollTimer.current = setInterval(() => {
      fetchStatus({ force: false });
    }, 2500);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [hasSelection, selected, fetchStatus]);

  useEffect(() => {
    if (!logOpen) return;
    const t = setInterval(() => {
      fetchLog();
    }, 5000);
    return () => clearInterval(t);
  }, [logOpen, fetchLog]);

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
    isRunningEff,
    isWaiting,
    isStarting,
    canDisarm,
    canArm,
    canStart,
    canPause,

    // still returned so UI can show note / title, but it no longer blocks on is_open=false
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