// frontend/src/components/dashboard/cards/BotControlCard.jsx
import HelpTooltip from "../../common/HelpTooltip.jsx";
import Modal from "../../common/Modal.jsx";
import LoadingOverlay from "../../common/LoadingOverlay.jsx";
import ErrorModal from "../../common/ErrorMessages.jsx";

import { BOT_CONTROL_CARD_CONTENT as COPY } from "../../../content/dashboard/botControlCard.content.js";

// ✅ Reuse BotLogsCard styling for the log modal rows
import "../../../css/dashboard/cards/BotLogsCard.css";
import "../../../css/dashboard/cards/BotControlCard.css";

import useBotControlCard from "../../../hooks/bots/useBotControlCard.js";
import { safeStr, fmtTime, fmtAge, pillTone } from "../../../lib/format/botFormat.js";

/**
 * storageScope (optional):
 * Pass something stable per-user (ex: authed user id) so the hook can namespace localStorage.
 * Example usage from parent:
 *   <BotControlCard storageScope={user?.id} ... />
 */
export default function BotControlCard({
  activeBotId,
  onActiveBotChange,
  onStartBot,
  onStopBot,
  storageScope, // ✅ NEW (optional)
}) {
  const ui = useBotControlCard({
    activeBotId,
    onActiveBotChange,
    onStartBot,
    onStopBot,
    COPY,
    storageScope, // ✅ NEW: lets hook persist per-user
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

    // state pills / derived
    runtimeTone,
    runtimeLabel,
    isArmed,

    // buttons
    busy,
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

    // modals
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
  } = ui;

  return (
    <>
      <ErrorModal open={errModalOpen} error={errModal} onClose={closeErrorModal} onAction={handleErrorAction} />

      <LoadingOverlay open={hardLoading} label={COPY.loading.overlayLabel} subtitle={COPY.loading.overlaySubtitle} />

      <div className="botCard" aria-busy={hardLoading}>
        {softLoading ? <div className="botCardSoftSpinner" aria-label="Refreshing bot status" title="Refreshing…" /> : null}

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

      <Modal
        open={logOpen}
        title={COPY.modals.log.title}
        onClose={closeLog}
        footer={
          <button className="mBtn" type="button" onClick={closeLog} disabled={logBusy}>
            {COPY.modals.log.close}
          </button>
        }
      >
        {/* ✅ Only block the UI on the very first load (no items yet) */}
        {logItems.length === 0 && logBusy ? (
          <div className="botModalLoading">{COPY.modals.log.loading}</div>
        ) : logItems.length === 0 ? (
          <div className="botModalLoading">{COPY.modals.log.empty}</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 10, maxHeight: "62vh", overflow: "auto", paddingRight: 6 }}>
              {logItems.map((it, idx) => {
                const sev = logSeverity(it);
                const headline = logMessageFor(it) || "Update";
                const action = safeStr(it?.event_type, "").replaceAll("_", " ") || "Event";

                return (
                  <div key={it?.event_id || `${idx}-${it?.ts || "0"}`} className={toneClass(sev)}>
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

            {/* ✅ tiny spinner at bottom during polling, no wiping */}
            {logBusy ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 0,            // spinner handles spacing via marginRight
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
            <button className="mBtn" type="button" onClick={closeRisk} disabled={riskBusy}>
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