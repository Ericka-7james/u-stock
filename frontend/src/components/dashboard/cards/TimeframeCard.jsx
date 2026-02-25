// frontend/src/components/dashboard/cards/TimeframeCard.jsx
import { useMemo, useState } from "react";
import Modal from "../../common/Modal.jsx";
import "../../../css/dashboard/cards/CardShared.css";

import {
  buildPreset,
  clampRange,
  computeInclusiveDays,
  mapDaysToTvInterval,
} from "../../../lib/time/timeframe.js";

import { TIMEFRAME_CARD_COPY as COPY } from "../../../content/dashboard/cards/timeframeCard.content.ts";

/**
 * Timeframe object shape:
 * {
 *   preset: "7d" | "today" | "24h" | "30d" | "90d" | "ytd" | "custom",
 *   start: "YYYY-MM-DD" | null,
 *   end: "YYYY-MM-DD" | null,
 *   label: string,
 *   days: number | null,
 *   tvInterval: "15" | "60" | "240" | "D" | "W"
 * }
 */

export default function TimeframeCard({
  variant = "card",
  title = COPY.header.title,
  subtitle = COPY.header.subtitle,
  value = null,
  onChange,
  disabled = false,
}) {
  const effective = useMemo(() => {
    if (value && typeof value === "object") {
      const start = value?.start ?? null;
      const end = value?.end ?? null;
      const days = value?.days ?? (start && end ? computeInclusiveDays(start, end) : null);
      const tvInterval = value?.tvInterval ?? mapDaysToTvInterval(days ?? 7);
      return { ...value, days, tvInterval };
    }
    return buildPreset("7d");
  }, [value]);

  const [open, setOpen] = useState(false);

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

  const badge = effective?.label || COPY.control.badgeFallback;

  const Control = (
    <>
      <button
        type="button"
        className="tpTab"
        onClick={openModal}
        disabled={disabled}
        title={COPY.control.buttonTitle}
        style={{ height: 34 }}
      >
        {badge} ▾
      </button>

      <Modal
        open={open}
        title={COPY.control.modalTitle}
        onClose={closeModal}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, width: "100%" }}>
            <button className="mBtn" type="button" onClick={closeModal}>
              {COPY.modal.footer.cancel}
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="mBtn" type="button" onClick={() => applyPreset("7d")}>
                {COPY.modal.footer.resetWeek}
              </button>
              <button
                className="mBtn mBtnPrimary"
                type="button"
                onClick={draftPreset === "custom" ? applyCustom : () => applyPreset(draftPreset)}
              >
                {COPY.modal.footer.apply}
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>{COPY.modal.sections.quickRanges}</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COPY.modal.presets.map((p) => (
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
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>{COPY.modal.sections.customRange}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>{COPY.modal.custom.startLabel}</span>
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
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>{COPY.modal.custom.endLabel}</span>
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
              {COPY.modal.note.prefix}
              <strong>{COPY.modal.note.strong}</strong>
              {COPY.modal.note.suffix}
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