// frontend/src/components/dashboard/cards/BotControlCard.jsx

import { useEffect, useRef } from "react";

import HelpTooltip from "../../common/HelpTooltip.jsx";
import Modal from "../../common/Modal.jsx";
import LoadingOverlay from "../../common/LoadingOverlay.jsx";
import ErrorModal from "../../common/ErrorModal.jsx";

import { BOT_CONTROL_CARD_CONTENT as COPY } from "../../../content/dashboard/botControlCard.content.js";

import "../../../css/dashboard/cards/BotLogsCard.css";
import "../../../css/dashboard/cards/BotControlCard.css";

import useBotControlCard from "../../../hooks/bots/useBotControlCard.js";
import { safeStr, fmtTime, fmtAge, pillTone } from "../../../lib/format/botFormat.js";

import botUnavailableSquirrel from "../../../assets/modal/bot-unavailable-squirrel.png";
import { lsSet } from "../../../lib/storage/localStorage.js";

/**
 * Local storage key base for the dashboard's currently selected bot.
 *
 * Scoped form:
 *   ustock:selected_bot_id_v1::<storageScope>
 *
 * Unscoped form:
 *   ustock:selected_bot_id_v1
 *
 * @type {string}
 */
const SELECTED_BOT_KEY_BASE = "ustock:selected_bot_id_v1";

/**
 * Builds a storage key scoped to a user or session identity.
 *
 * @param {string} base
 * @param {string | number | null | undefined} scope
 * @returns {string}
 */
function scopedKey(base, scope) {
  const s = String(scope || "").trim();
  return s ? `${base}::${s}` : base;
}

/**
 * Returns true if the provided selected bot id exists in the available bot list.
 *
 * @param {Array<{ id?: string, name?: string }>} available
 * @param {string} selectedId
 * @returns {boolean}
 */
function selectionExists(available, selectedId) {
  if (!selectedId) return false;
  return (available || []).some((bot) => safeStr(bot?.id, "") === selectedId);
}

/**
 * Returns true when the current error modal content represents a "bot unavailable" case.
 *
 * @param {boolean} errModalOpen
 * @param {{ title?: string, message?: string, detail?: string } | null | undefined} errModal
 * @returns {boolean}
 */
function isBotUnavailableError(errModalOpen, errModal) {
  if (!errModalOpen) return false;

  const text = String(errModal?.title || errModal?.message || errModal?.detail || "");
  return /bot unavailable|bot not found|unavailable/i.test(text);
}

/**
 * Small presentational tile for bot status metrics.
 *
 * @param {{
 *   label: string,
 *   value: string,
 *   full?: boolean,
 *   subtext?: string | null
 * }} props
 * @returns {JSX.Element}
 */
function BotTile({ label, value, full = false, subtext = null }) {
  return (
    <div className={`botTile ${full ? "botTileFull" : ""}`}>
      <div className="botTileLabel">{label}</div>
      <div className="botTileValue">{value}</div>
      {subtext ? <div className="botPausedLine">{subtext}</div> : null}
    </div>
  );
}

/**
 * Shared modal footer button.
 *
 * @param {{
 *   children: React.ReactNode,
 *   onClick: () => void,
 *   disabled?: boolean,
 *   primary?: boolean,
 *   type?: "button" | "submit" | "reset"
 * }} props
 * @returns {JSX.Element}
 */
function ModalButton({ children, onClick, disabled = false, primary = false, type = "button" }) {
  return (
    <button className={`mBtn ${primary ? "mBtnPrimary" : ""}`} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/**
 * Renders a single log event block inside the log modal.
 *
 * @param {{
 *   item: any,
 *   index: number,
 *   logSeverity: (item: any) => "info" | "warn" | "error",
 *   toneClass: (sev: "info" | "warn" | "error") => string,
 *   logMessageFor: (item: any) => string,
 *   safeJson: (value: any) => string
 * }} props
 * @returns {JSX.Element}
 */
function LogEventCard({ item, index, logSeverity, toneClass, logMessageFor, safeJson }) {
  const sev = logSeverity(item);
  const headline = logMessageFor(item) || "Update";
  const action = safeStr(item?.event_type, "").replaceAll("_", " ") || "Event";
  const key = item?.event_id || `${index}-${item?.ts || "0"}`;

  return (
    <div key={key} className={toneClass(sev)}>
      <div className="blog-evtTop">
        <div className="blog-evtLeft">
          <div className="blog-evtTitle">{headline}</div>

          <div className="blog-evtSub">
            <span className="blog-evtChip">System</span>
            <span className="blog-evtDot">•</span>
            <span className="blog-evtChip blog-evtChip--soft">{action}</span>
            <span className="blog-evtDot">•</span>
            <span className="mMono">{item?.ts ? fmtTime(item.ts) : "—"}</span>
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
            <div className="mMono">{safeStr(item?.level, "info").toUpperCase()}</div>

            <div className="blog-rawLabel">Event</div>
            <div className="mMono">{safeStr(item?.event_type, "—")}</div>

            <div className="blog-rawLabel">Message</div>
            <div>{headline}</div>

            <div className="blog-rawLabel">Payload</div>
            <pre className="mMono blog-pre">{item?.payload ? safeJson(item.payload) : "—"}</pre>
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * BotControlCard
 *
 * Dashboard control panel for selecting, arming, starting, pausing, and inspecting
 * trading bots. This component is intentionally "feature complete in one file" so
 * it can be maintained without immediate modularization.
 *
 * Responsibilities:
 * - render bot selection and action controls
 * - reflect bot runtime / market / heartbeat state
 * - persist selected bot id to localStorage
 * - sync selected bot back to parent via onActiveBotChange
 * - render confirmation, logs, and risk configuration modals
 * - display hard-loading / soft-loading / error UI states
 *
 * Non-responsibilities:
 * - fetching / mutation logic
 * - business state derivation
 * - risk validation rules
 *
 * Those are delegated to useBotControlCard().
 *
 * @param {{
 *   activeBotId?: string | null,
 *   onActiveBotChange?: (botId: string) => void,
 *   onStartBot?: (...args: any[]) => void,
 *   onStopBot?: (...args: any[]) => void,
 *   storageScope?: string | number | null
 * }} props
 * @returns {JSX.Element}
 */
export default function BotControlCard({
  activeBotId,
  onActiveBotChange,
  onStartBot,
  onStopBot,
  storageScope,
}) {
  const ui = useBotControlCard({
    activeBotId,
    onActiveBotChange,
    onStartBot,
    onStopBot,
    COPY,
    storageScope,
  });

  const {
    // error modal
    errModalOpen,
    errModal,
    closeErrorModal,
    handleErrorAction,

    // loading overlay
    hardLoading,
    softLoading,

    // selection
    available,
    selected,
    selectedMeta,
    hasSelection,
    onSelect,

    // derived state
    runtimeTone,
    runtimeLabel,
    isArmed,

    // buttons / runtime flags
    busy,
    armBusy,
    startBusy,
    isRunningEff,
    isWaiting,
    isStarting,
    canDisarm,
    canArm,
    canStart,
    canPause,
    marketClosedBlocksStart,

    // handlers
    openLog,
    openRisk,
    doDisarm,
    doPause,
    requestArm,
    requestStart,

    // inline note
    showMarketClosedNote,
    startBlockedReason,
    nextOpenEpoch,

    // tiles
    intent,
    eff,
    desiredState,
    hbAge,
    isOpen,
    statusLine,
    message,

    // arm modal
    armConfirmOpen,
    setArmConfirmOpen,
    confirmArm,

    // start modal
    startConfirmOpen,
    setStartConfirmOpen,
    confirmStart,

    // log modal
    logOpen,
    closeLog,
    logBusy,
    logItems,
    logSeverity,
    toneClass,
    logMessageFor,
    safeJson,

    // risk modal
    riskOpen,
    closeRisk,
    riskBusy,
    riskDraft,
    riskTouched,
    riskErrors,
    onRiskChange,
    onRiskBlur,
    saveRisk,

    // display mode
    mode,
  } = ui;

  const selectedId = safeStr(selected, "");
  const hasSelectedInAvailable = selectionExists(available, selectedId);
  const hasValidSelection = !!hasSelection && hasSelectedInAvailable;
  const selectedValue = hasValidSelection ? selectedId : "";

  const showStaleSelectionHint =
    Array.isArray(available) && available.length > 0 && !!hasSelection && !hasSelectedInAvailable;

  const showBotUnavailableArt = isBotUnavailableError(errModalOpen, errModal);

  const selectedBotLsKey = scopedKey(SELECTED_BOT_KEY_BASE, storageScope);
  const lastPersistedRef = useRef(null);

  /**
   * Persist only meaningful selected bot changes.
   * Prevents redundant writes when state re-renders with the same value.
   */
  useEffect(() => {
    const next = String(selectedValue || "").trim();
    if (lastPersistedRef.current === next) return;

    lastPersistedRef.current = next;

    try {
      lsSet(selectedBotLsKey, next);
    } catch {
      // Local storage failures should not break dashboard interaction.
    }
  }, [selectedValue, selectedBotLsKey]);

  /**
   * Notify parent when the local valid selection diverges from activeBotId.
   * This keeps dashboard-level state synchronized without firing on empty / stale selection.
   */
  useEffect(() => {
    if (!hasValidSelection) return;

    const active = safeStr(activeBotId, "");
    const next = safeStr(selectedValue, "");

    if (!next) return;
    if (active === next) return;

    if (typeof onActiveBotChange === "function") {
      onActiveBotChange(next);
    }
  }, [hasValidSelection, selectedValue, activeBotId, onActiveBotChange]);

  return (
    <>
      <ErrorModal open={errModalOpen} error={errModal} onClose={closeErrorModal} onAction={handleErrorAction}>
        {showBotUnavailableArt ? (
          <div style={{ display: "grid", placeItems: "center", paddingTop: 8 }}>
            <img
              src={botUnavailableSquirrel}
              alt="Squirrel holding a sign: bot unavailable"
              style={{ width: 180, height: "auto", opacity: 0.95 }}
              draggable={false}
            />
          </div>
        ) : null}
      </ErrorModal>

      <LoadingOverlay open={hardLoading} label={COPY.loading.overlayLabel} subtitle={COPY.loading.overlaySubtitle} />

      <div className="botCard" aria-busy={hardLoading}>
        {softLoading ? (
          <div className="botCardSoftSpinner" aria-label="Refreshing bot status" title="Refreshing…" />
        ) : null}

        <header className="card-header botCardHead">
          <div className="card-header-left">
            <div className="botCardTitleRow">
              <div className="botCardTitle">{COPY.title}</div>
              <HelpTooltip text={COPY.help} />
            </div>
          </div>

          <div className="card-header-right">
            <div className="botPillRow">
              <div className="botCardStatePill mode" title={COPY.pills.paper.title}>
                {COPY.pills.paper.label}
              </div>

              <div
                className={`botCardStatePill arm ${hasValidSelection && isArmed ? "warn" : "neg"}`}
                title={
                  !hasValidSelection
                    ? COPY.pills.armed.titleNone
                    : isArmed
                      ? COPY.pills.armed.titleArmed
                      : COPY.pills.armed.titleDisarmed
                }
              >
                {!hasValidSelection
                  ? COPY.pills.armed.none
                  : isArmed
                    ? COPY.pills.armed.armed
                    : COPY.pills.armed.disarmed}
              </div>

              <div className={`botCardStatePill status ${pillTone(runtimeTone)}`}>{runtimeLabel}</div>
            </div>
          </div>
        </header>

        <div className="botCardBody">
          <div className="botCardTopRow">
            <div className="botSelectWrap">
              <label className="botLabel">{COPY.select.label}</label>

              <select className="botSelect" value={selectedValue} onChange={onSelect} disabled={busy}>
                <option value="">{COPY.select.placeholder}</option>
                {(available || []).map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name || bot.id}
                  </option>
                ))}
              </select>

              <div className="botHint">
                {showStaleSelectionHint
                  ? "Previously selected bot is unavailable. Please choose again."
                  : safeStr(selectedMeta?.description, hasValidSelection ? "" : COPY.select.hintNone)}
              </div>
            </div>

            <div className="botActions">
              <button className="botBtn" type="button" onClick={openLog} disabled={!hasValidSelection}>
                {COPY.actions.viewLog}
              </button>

              <button className="botBtn" type="button" onClick={openRisk} disabled={!hasValidSelection}>
                {COPY.actions.risk}
              </button>

              {!isRunningEff && !isWaiting && !isStarting ? (
                isArmed ? (
                  <button className="botBtn" type="button" onClick={doDisarm} disabled={!canDisarm || !hasValidSelection}>
                    {COPY.actions.disarm}
                  </button>
                ) : (
                  <button className="botBtn" type="button" onClick={requestArm} disabled={!canArm || !hasValidSelection}>
                    {COPY.actions.arm}
                  </button>
                )
              ) : null}

              {isRunningEff || isWaiting || isStarting ? (
                <button className="botBtn stop" type="button" onClick={doPause} disabled={!canPause || !hasValidSelection}>
                  {COPY.actions.pause}
                </button>
              ) : (
                <button
                  className="botBtn start"
                  type="button"
                  onClick={requestStart}
                  disabled={!canStart || !hasValidSelection}
                  title={
                    !hasValidSelection
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
            <BotTile label={COPY.tiles.intent} value={hasValidSelection ? intent || "—" : "—"} />
            <BotTile label={COPY.tiles.effective} value={hasValidSelection ? eff || "—" : "—"} />
            <BotTile label={COPY.tiles.desired} value={hasValidSelection ? desiredState || "—" : "—"} />
            <BotTile
              label={COPY.tiles.heartbeat}
              value={!hasValidSelection ? "—" : hbAge == null ? "—" : `${fmtAge(hbAge)} ago`}
            />
            <BotTile
              label={isOpen ? COPY.tiles.market : COPY.tiles.nextOpen}
              value={isOpen ? COPY.market.openNow : nextOpenEpoch ? fmtTime(nextOpenEpoch) : "—"}
            />
            <BotTile
              label={COPY.tiles.status}
              value={statusLine}
              full
              subtext={hasValidSelection && message ? message : null}
            />
          </div>
        </div>
      </div>

      <Modal
        open={armConfirmOpen}
        title={COPY.modals.arm.title}
        onClose={() => setArmConfirmOpen(false)}
        footer={
          <>
            <ModalButton onClick={() => setArmConfirmOpen(false)} disabled={armBusy}>
              {COPY.modals.arm.cancel}
            </ModalButton>
            <ModalButton onClick={confirmArm} disabled={armBusy || !hasValidSelection} primary>
              {COPY.modals.arm.confirm}
            </ModalButton>
          </>
        }
      >
        <div className="botModalStack">
          <div className="botModalRow">
            <span className="botModalLabel">{COPY.modals.arm.botLabel}</span>
            <span className="mono">{safeStr(selectedValue, "—")}</span>
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
            <ModalButton onClick={() => setStartConfirmOpen(false)} disabled={startBusy}>
              {COPY.modals.start.cancel}
            </ModalButton>
            <ModalButton onClick={confirmStart} disabled={startBusy || !hasValidSelection} primary>
              {COPY.modals.start.confirm}
            </ModalButton>
          </>
        }
      >
        <div className="botModalStack">
          <div className="botModalRow">
            <span className="botModalLabel">{COPY.modals.start.botLabel}</span>
            <span className="mono">{safeStr(selectedValue, "—")}</span>
          </div>

          <div className="botModalHelper">
            {COPY.modals.start.modePrefix} <span className="mono">{mode}</span> · {COPY.modals.start.helper}
          </div>

          {!isArmed ? <div className="botModalDanger">{COPY.modals.start.notArmed}</div> : null}
          {marketClosedBlocksStart ? <div className="botModalWarn">{COPY.modals.start.marketClosed}</div> : null}
        </div>
      </Modal>

      <Modal
        open={logOpen}
        title={COPY.modals.log.title}
        onClose={closeLog}
        footer={
          <ModalButton onClick={closeLog} disabled={logBusy}>
            {COPY.modals.log.close}
          </ModalButton>
        }
      >
        {logItems.length === 0 && logBusy ? (
          <div className="botModalLoading">{COPY.modals.log.loading}</div>
        ) : logItems.length === 0 ? (
          <div className="botModalLoading">{COPY.modals.log.empty}</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 10, maxHeight: "62vh", overflow: "auto", paddingRight: 6 }}>
              {logItems.map((item, index) => (
                <LogEventCard
                  key={item?.event_id || `${index}-${item?.ts || "0"}`}
                  item={item}
                  index={index}
                  logSeverity={logSeverity}
                  toneClass={toneClass}
                  logMessageFor={logMessageFor}
                  safeJson={safeJson}
                />
              ))}
            </div>

            {logBusy ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 0,
                  paddingTop: 10,
                  paddingLeft: 8,
                  opacity: 0.75,
                  fontWeight: 800,
                  fontSize: 12,
                }}
                aria-live="polite"
              >
                <span
                  className="botCardSoftSpinner"
                  aria-label="Updating logs"
                  title="Updating…"
                  style={{
                    marginLeft: 0,
                    marginRight: 10,
                    flex: "0 0 auto",
                    position: "static",
                  }}
                />
                Updating…
              </div>
            ) : null}
          </>
        )}
      </Modal>

      <Modal
        open={riskOpen}
        title={COPY.modals.risk.title}
        onClose={closeRisk}
        footer={
          <>
            <ModalButton onClick={closeRisk} disabled={riskBusy}>
              {COPY.modals.risk.cancel}
            </ModalButton>
            <ModalButton onClick={saveRisk} disabled={riskBusy || !hasValidSelection} primary>
              {COPY.modals.risk.save}
            </ModalButton>
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
              className={`botInput ${
                riskTouched.max_trades_per_day && riskErrors.max_trades_per_day ? "botInputError" : ""
              }`}
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