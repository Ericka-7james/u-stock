// frontend/src/components/dashboard/cards/TimeframeCard.jsx
import { useMemo, useState } from "react";
import Modal from "../../common/Modal.jsx";
import "../../../css/dashboard/cards/CardShared.css";

/**
 * Timeframe object shape:
 * {
 *   preset: "7d" | "today" | "24h" | "30d" | "90d" | "ytd" | "custom",
 *   start: "YYYY-MM-DD" | null,
 *   end: "YYYY-MM-DD" | null,
 *   label: string,
 *   // ✅ NEW: derived hints for the rest of the UI
 *   days: number | null,
 *   tvInterval: "15" | "60" | "240" | "D" | "W"
 * }
 *
 * Notes:
 * - TradingView free Advanced Chart embed does NOT let us force the visible window.
 * - We only use timeframe to pick a sensible candle interval (15m/1h/4h/1D/1W).
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function startOfYear(date) {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function clampRange(start, end) {
  if (!start || !end) return { start, end };
  if (start <= end) return { start, end };
  return { start: end, end: start };
}

function parseDateLoose(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d?.getTime?.()) ? d : null;
}

// inclusive days: Jan 28 -> Feb 1 = 5 days
function computeInclusiveDays(start, end) {
  const a = parseDateLoose(start);
  const b = parseDateLoose(end);
  if (!a || !b) return null;

  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

// ✅ Your rule: map days -> TradingView candle interval
function mapDaysToTvInterval(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return "60"; // default "Past week feel"
  if (d <= 2) return "15"; // 15m
  if (d <= 10) return "60"; // 1h
  if (d <= 45) return "240"; // 4h
  if (d <= 180) return "D"; // 1D
  return "W"; // 1W
}

function buildPreset(preset) {
  const now = new Date();
  const t = todayStr();

  if (preset === "today") {
    const days = 1;
    return { preset, start: t, end: t, label: "Today", days, tvInterval: mapDaysToTvInterval(days) };
  }

  // "Last 24h" still maps to ≤2 days. We cannot force last-24h window in the widget.
  if (preset === "24h") {
    const days = 1;
    return { preset, start: t, end: t, label: "Last 24h", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "7d") {
    const start = toDateStr(addDays(now, -6));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 7;
    return { preset, start, end, label: "Past week", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "30d") {
    const start = toDateStr(addDays(now, -29));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 30;
    return { preset, start, end, label: "Past 30 days", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "90d") {
    const start = toDateStr(addDays(now, -89));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 90;
    return { preset, start, end, label: "Past 90 days", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "ytd") {
    const start = toDateStr(startOfYear(now));
    const end = t;
    const days = computeInclusiveDays(start, end);
    return { preset, start, end, label: "Year to date", days, tvInterval: mapDaysToTvInterval(days) };
  }

  // fallback = past week
  {
    const start = toDateStr(addDays(now, -6));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 7;
    return { preset: "7d", start, end, label: "Past week", days, tvInterval: mapDaysToTvInterval(days) };
  }
}

export default function TimeframeCard({
  // "card" = full panel card
  // "inline" = just the control (for embedding in another header)
  variant = "card",

  title = "Timeframe",
  subtitle = "Defaults to Past week. Used for filters and to set the chart candle interval (zoom is controlled in-chart).",
  value = null,
  onChange,
  disabled = false,
}) {
  // default = past week if none provided
  const effective = useMemo(() => {
    if (value && typeof value === "object") {
      // Ensure any external value still has derived fields
      const start = value?.start ?? null;
      const end = value?.end ?? null;
      const days = value?.days ?? (start && end ? computeInclusiveDays(start, end) : null);
      const tvInterval = value?.tvInterval ?? mapDaysToTvInterval(days ?? 7);
      return { ...value, days, tvInterval };
    }
    return buildPreset("7d");
  }, [value]);

  const [open, setOpen] = useState(false);

  // Custom draft state for the modal
  const [draftPreset, setDraftPreset] = useState(effective?.preset || "7d");
  const [draftStart, setDraftStart] = useState(effective?.start || "");
  const [draftEnd, setDraftEnd] = useState(effective?.end || "");

  function openModal() {
    if (disabled) return;
    setDraftPreset(effective?.preset || "7d");
    setDraftStart(effective?.start || "");
    setDraftEnd(effective?.end || "");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  function applyPreset(preset) {
    const tf = buildPreset(preset);
    onChange?.(tf);
    setOpen(false);
  }

  function applyCustom() {
    const start = String(draftStart || "").trim();
    const end = String(draftEnd || "").trim();
    const fixed = clampRange(start, end);

    // If user leaves one blank, treat as "past week"
    if (!fixed.start || !fixed.end) {
      const tf = buildPreset("7d");
      onChange?.(tf);
      setOpen(false);
      return;
    }

    const days = computeInclusiveDays(fixed.start, fixed.end);
    const tvInterval = mapDaysToTvInterval(days ?? 7);
    const label = `${fixed.start} → ${fixed.end}`;

    onChange?.({ preset: "custom", start: fixed.start, end: fixed.end, label, days, tvInterval });
    setOpen(false);
  }

  const badge = effective?.label || "Past week";

  const Control = (
    <>
      <button
        type="button"
        className="tpTab"
        onClick={openModal}
        disabled={disabled}
        title="Choose date range"
        style={{ height: 34 }}
      >
        {badge} ▾
      </button>

      <Modal
        open={open}
        title="Choose date range"
        onClose={closeModal}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, width: "100%" }}>
            <button className="mBtn" type="button" onClick={closeModal}>
              Cancel
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="mBtn" type="button" onClick={() => applyPreset("7d")}>
                Reset to week
              </button>
              <button
                className="mBtn mBtnPrimary"
                type="button"
                onClick={draftPreset === "custom" ? applyCustom : () => applyPreset(draftPreset)}
              >
                Apply
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Quick ranges</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { id: "today", label: "Today" },
              { id: "24h", label: "Last 24h" },
              { id: "7d", label: "Past week" },
              { id: "30d", label: "Past 30 days" },
              { id: "90d", label: "Past 90 days" },
              { id: "ytd", label: "Year to date" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className="tpTab"
                onClick={() => {
                  setDraftPreset(p.id);
                  if (p.id !== "custom") {
                    const tf = buildPreset(p.id);
                    setDraftStart(tf.start || "");
                    setDraftEnd(tf.end || "");
                  }
                }}
                style={{
                  height: 34,
                  boxShadow: draftPreset === p.id ? "0 0 0 3px rgba(34,197,94,0.12)" : undefined,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(148,163,184,0.18)" }}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Custom range</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>Start</span>
                <input
                  type="date"
                  value={draftStart}
                  onChange={(e) => {
                    setDraftPreset("custom");
                    setDraftStart(e.target.value);
                  }}
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.35)",
                    padding: "0 10px",
                    background: "transparent",
                    color: "inherit",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>End</span>
                <input
                  type="date"
                  value={draftEnd}
                  onChange={(e) => {
                    setDraftPreset("custom");
                    setDraftEnd(e.target.value);
                  }}
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.35)",
                    padding: "0 10px",
                    background: "transparent",
                    color: "inherit",
                  }}
                />
              </label>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Note: The TradingView embed can’t be forced to “show exactly this window”. We use this range to pick a
              sensible <strong>candle interval</strong>; you can zoom/pan inside the chart.
            </div>
          </div>
        </div>
      </Modal>
    </>
  );

  if (variant === "inline") {
    return <div style={{ display: "grid", justifyItems: "end" }}>{Control}</div>;
  }

  return (
    <section className="panel">
      <div className="panelHeader" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="panelTitle">{title}</h3>
          <p className="panelSubtitle">{subtitle}</p>
        </div>
        <div style={{ display: "grid", justifyItems: "end" }}>{Control}</div>
      </div>
    </section>
  );
}
