// frontend/src/lib/validation/botRisk.js

function isStrictNumericString(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return /^\d+(\.\d+)?$/.test(s);
}

/**
 * validateRiskDraft(draft, COPY)
 * - COPY is optional; when provided, uses your content strings for errors
 */
export function validateRiskDraft(draft, COPY) {
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
