// frontend/src/components/dashboard/cards/BotControlCard.jsx

import { useMemo } from "react";

import HelpTooltip from "../../common/HelpTooltip.jsx";
import Modal from "../../common/Modal.jsx";
import LoadingOverlay from "../../common/LoadingOverlay.jsx";
import ErrorModal from "../../common/ErrorModal.jsx";

import { BOT_CONTROL_CARD_CONTENT as COPY } from "../../../content/dashboard/botControlCard.content.js";

import "../../../css/dashboard/cards/BotLogsCard.css";
import "../../../css/dashboard/cards/BotControlCard.css";

import useBotControlCard from "../../../hooks/bots/botControlCard/useBotControlCard.js";
import { safeStr, fmtTime, fmtAge, pillTone } from "../../../lib/format/botFormat.js";

import botUnavailableSquirrel from "../../../assets/modal/bot-unavailable-squirrel.png";

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
 * Returns true when the current error modal content represents a bot-unavailable
 * case.
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
 *   onClick?: () => void,
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
 * Supports the new bot_logs shape:
 * - action
 * - user_message
 * - technical_message
 * - details
 * - request_id
 * - runner_id
 *
 * while remaining tolerant of legacy event-ish fields.
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
  const action = safeStr(item?.action || item?.event_type, "").replaceAll("_", " ") || "Log";
  const source = safeStr(item?.source, "system");
  const key = item?.request_id || item?.event_id || item?.id || `${index}-${item?.ts || "0"}`;

  const details = item?.details && typeof item.details === "object" ? item.details : {};
  const rawPayload =
    item?.details && typeof item.details === "object"
      ? item.details
      : item?.payload && typeof item.payload === "object"
        ? item.payload
        : null;

  const technicalMessage = safeStr(item?.technical_message, "");
  const runnerId = safeStr(item?.runner_id, "");
  const desiredState = safeStr(item?.desired_state, "");
  const runtimeState = safeStr(item?.runtime_state, "");

  return (
    <div key={key} className={toneClass(sev)}>
      <div className="blog-evtTop">
        <div className="blog-evtLeft">
          <div className="blog-evtTitle">{headline}</div>

          <div className="blog-evtSub">
            <span className="blog-evtChip">{source || "system"}</span>
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
            <div className="mMono">{safeStr(item?.level || item?.status, "info").toUpperCase()}</div>

            <div className="blog-rawLabel">Action</div>
            <div className="mMono">{safeStr(item?.action || item?.event_type, "—")}</div>

            <div className="blog-rawLabel">Source</div>
            <div className="mMono">{safeStr(item?.source, "—")}</div>

            <div className="blog-rawLabel">Message</div>
            <div>{headline}</div>

            {technicalMessage ? (
              <>
                <div className="blog-rawLabel">Technical</div>
                <div>{technicalMessage}</div>
              </>
            ) : null}

            {runnerId ? (
              <>
                <div className="blog-rawLabel">Runner</div>
                <div className="mMono">{runnerId}</div>
              </>
            ) : null}

            {desiredState ? (
              <>
                <div className="blog-rawLabel">Desired</div>
                <div className="mMono">{desiredState}</div>
              </>
            ) : null}

            {runtimeState ? (
              <>
                <div className="blog-rawLabel">Runtime</div>
                <div className="mMono">{runtimeState}</div>
              </>
            ) : null}

            <div className="blog-rawLabel">Details</div>
            <pre className="mMono blog-pre">
              {rawPayload ? safeJson(rawPayload) : Object.keys(details).length ? safeJson(details) : "—"}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * BotControlCard
 *
 * Dashboard control panel for selecting, arming, starting, pausing, and
 * inspecting trading bots.
 *
 * Responsibilities:
 * - render bot selection and action controls
 * - reflect bot runtime / market / heartbeat state
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
  } = ui;

  const selectedId = safeStr(selected, "");
  const hasSelectedInAvailable = selectionExists(available, selectedId);
  const hasValidSelection = Boolean(hasSelection && hasSelectedInAvailable);
  const selectedValue = hasValidSelection ? selectedId : "";

  const showStaleSelectionHint = useMemo(() => {
    return Array.isArray(available) && available.length > 0 && Boolean(hasSelection) && !hasSelectedInAvailable;
  }, [available, hasSelection, hasSelectedInAvailable]);

  const showBotUnavailableArt = isBotUnavailableError(errModalOpen, errModal);

  const showStopAction = isRunningEff || isWaiting || isStarting;
  const showArmAction = !showStopAction && !isArmed;
  const showDisarmAction = !showStopAction && isArmed;

  const statusSubtext = useMemo(() => {
    if (!hasValidSelection) return null;
    if (message) return message;
    if (pausedReason) return pausedReason;
    return null;
  }, [hasValidSelection, message, pausedReason]);

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

      <div className="botCard" aria-busy={hardLoading || softLoading}>
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

              {showArmAction ? (
                <button className="botBtn" type="button" onClick={requestArm} disabled={!canArm || !hasValidSelection}>
                  {COPY.actions.arm}
                </button>
              ) : null}

              {showDisarmAction ? (
                <button
                  className="botBtn"
                  type="button"
                  onClick={doDisarm}
                  disabled={!canDisarm || !hasValidSelection}
                >
                  {COPY.actions.disarm}
                </button>
              ) : null}

              {showStopAction ? (
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
            <BotTile label={COPY.tiles.status} value={statusLine} full subtext={statusSubtext} />
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
                  key={item?.request_id || item?.event_id || `${index}-${item?.ts || "0"}`}
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

      <Modal
        open={selectPromptOpen}
        title="Select a bot"
        onClose={() => setSelectPromptOpen(false)}
        footer={
          <ModalButton onClick={() => setSelectPromptOpen(false)} primary>
            Got it
          </ModalButton>
        }
      >
        <div className="botModalStack">
          <div className="botModalHelper">
            Choose a bot to see status, adjust risk settings, and control runtime actions.
          </div>
        </div>
      </Modal>
    </>
  );
}