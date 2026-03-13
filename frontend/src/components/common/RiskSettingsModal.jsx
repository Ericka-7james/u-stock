// frontend/src/common/RiskSettingsModal.jsx

import Modal from "./Modal.jsx";
import ModalButton from "./ModalButton.jsx";

/**
 * Risk settings modal for editing per-bot guardrail values.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSave: () => void,
 *   busy: boolean,
 *   hasValidSelection: boolean,
 *   riskDraft: {
 *     risk_per_trade: string,
 *     max_trades_per_day: string,
 *     min_confidence: string
 *   },
 *   riskTouched: Record<string, boolean>,
 *   riskErrors: Record<string, string>,
 *   onRiskChange: (field: string, value: string) => void,
 *   onRiskBlur: (field: string) => void,
 *   copy: any
 * }} props
 * @returns {JSX.Element}
 */
export default function RiskSettingsModal({
  open,
  onClose,
  onSave,
  busy,
  hasValidSelection,
  riskDraft,
  riskTouched,
  riskErrors,
  onRiskChange,
  onRiskBlur,
  copy,
}) {
  const hasAnyRiskErrors = Object.values(riskErrors || {}).some(Boolean);

  return (
    <Modal
      open={open}
      title={copy.modals.risk.title}
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={busy}>
            {copy.modals.risk.cancel}
          </ModalButton>

          <ModalButton
            onClick={onSave}
            disabled={busy || !hasValidSelection}
            primary
          >
            {copy.modals.risk.save}
          </ModalButton>
        </>
      }
    >
      <div className="botRiskGrid">
        <label className="botRiskField">
          <div className="botRiskLabel">
            {copy.modals.risk.fields.risk_per_trade.label}
          </div>

          <input
            className={`botInput ${
              riskTouched.risk_per_trade && riskErrors.risk_per_trade
                ? "botInputError"
                : ""
            }`}
            value={riskDraft.risk_per_trade}
            onChange={(e) => onRiskChange("risk_per_trade", e.target.value)}
            onBlur={() => onRiskBlur("risk_per_trade")}
            placeholder={copy.modals.risk.fields.risk_per_trade.placeholder}
            inputMode="decimal"
          />

          {riskTouched.risk_per_trade && riskErrors.risk_per_trade ? (
            <div className="botFieldError" role="alert">
              {riskErrors.risk_per_trade}
            </div>
          ) : null}
        </label>

        <label className="botRiskField">
          <div className="botRiskLabel">
            {copy.modals.risk.fields.max_trades_per_day.label}
          </div>

          <input
            className={`botInput ${
              riskTouched.max_trades_per_day &&
              riskErrors.max_trades_per_day
                ? "botInputError"
                : ""
            }`}
            value={riskDraft.max_trades_per_day}
            onChange={(e) =>
              onRiskChange("max_trades_per_day", e.target.value)
            }
            onBlur={() => onRiskBlur("max_trades_per_day")}
            placeholder={copy.modals.risk.fields.max_trades_per_day.placeholder}
            inputMode="numeric"
          />

          {riskTouched.max_trades_per_day &&
          riskErrors.max_trades_per_day ? (
            <div className="botFieldError" role="alert">
              {riskErrors.max_trades_per_day}
            </div>
          ) : null}
        </label>

        <label className="botRiskField">
          <div className="botRiskLabel">
            {copy.modals.risk.fields.min_confidence.label}
          </div>

          <input
            className={`botInput ${
              riskTouched.min_confidence && riskErrors.min_confidence
                ? "botInputError"
                : ""
            }`}
            value={riskDraft.min_confidence}
            onChange={(e) => onRiskChange("min_confidence", e.target.value)}
            onBlur={() => onRiskBlur("min_confidence")}
            placeholder={copy.modals.risk.fields.min_confidence.placeholder}
            inputMode="decimal"
          />

          {riskTouched.min_confidence && riskErrors.min_confidence ? (
            <div className="botFieldError" role="alert">
              {riskErrors.min_confidence}
            </div>
          ) : null}
        </label>

        {hasAnyRiskErrors ? (
          <div className="botRiskHint" role="status" aria-live="polite">
            {copy.modals.risk.validationHint}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}