/* src/css/dashboard/cards/BotLogsCard.css */

/* ------------------------------------------
   Scoped theme tokens for this card
------------------------------------------- */
.blog-card {
  min-width: 0;

  /* fallbacks (if app tokens not present) */
  --blog-text-strong: var(--ustock-text-strong, #0f172a);
  --blog-text-main: var(--ustock-text-main, #0f172a);
  --blog-text-muted: var(--ustock-text-muted, #64748b);

  --blog-surface: var(--ustock-bg-card, #ffffff);
  --blog-surface-2: rgba(15, 23, 42, 0.02);

  --blog-border: rgba(148, 163, 184, 0.22);
  --blog-border-soft: rgba(148, 163, 184, 0.18);

  --blog-ok: rgba(34, 197, 94, 0.10);
  --blog-warn: rgba(245, 158, 11, 0.10);
  --blog-bad: rgba(239, 68, 68, 0.10);

  /* critical: nothing should visually spill past rounded corners */
  overflow: hidden;
}

/* If your app uses theme hooks, these will win */
.theme-dark .blog-card,
[data-theme="dark"] .blog-card {
  --blog-text-strong: #e5e7eb;
  --blog-text-main: rgba(226, 232, 240, 0.90);
  --blog-text-muted: rgba(226, 232, 240, 0.68);

  --blog-surface: rgba(15, 23, 42, 0.65);
  --blog-surface-2: rgba(30, 41, 59, 0.35);

  --blog-border: rgba(148, 163, 184, 0.20);
  --blog-border-soft: rgba(148, 163, 184, 0.14);

  --blog-ok: rgba(34, 197, 94, 0.14);
  --blog-warn: rgba(245, 158, 11, 0.14);
  --blog-bad: rgba(239, 68, 68, 0.14);
}

/* Fallback: OS dark mode */
@media (prefers-color-scheme: dark) {
  .blog-card {
    --blog-text-strong: #e5e7eb;
    --blog-text-main: rgba(226, 232, 240, 0.90);
    --blog-text-muted: rgba(226, 232, 240, 0.68);

    --blog-surface: rgba(15, 23, 42, 0.65);
    --blog-surface-2: rgba(30, 41, 59, 0.35);

    --blog-border: rgba(148, 163, 184, 0.20);
    --blog-border-soft: rgba(148, 163, 184, 0.14);

    --blog-ok: rgba(34, 197, 94, 0.14);
    --blog-warn: rgba(245, 158, 11, 0.14);
    --blog-bad: rgba(239, 68, 68, 0.14);
  }
}

/* ------------------------------------------
   Header
------------------------------------------- */

.blog-header {
  margin-bottom: 12px;
  min-width: 0;
}

.blog-titleRow {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.blog-title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: var(--blog-text-strong);

  /* prevent overflow */
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.blog-subtitle {
  margin-top: 4px;
  color: var(--blog-text-muted);

  overflow-wrap: anywhere;
  word-break: break-word;
}

.blog-headerActions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

/* ------------------------------------------
   Chips & pills (header)
------------------------------------------- */

.blog-chip {
  font-size: 12px;
  font-weight: 900;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--blog-border);
  background: rgba(15, 23, 42, 0.03);
  color: var(--blog-text-main);
  white-space: nowrap;
}

.theme-dark .blog-chip,
[data-theme="dark"] .blog-chip {
  background: rgba(148, 163, 184, 0.10);
}

@media (prefers-color-scheme: dark) {
  .blog-chip {
    background: rgba(148, 163, 184, 0.10);
  }
}

.blog-chip--ok {
  border-color: rgba(34, 197, 94, 0.35);
  background: var(--blog-ok);
}

.blog-chip--warn {
  border-color: rgba(245, 158, 11, 0.35);
  background: var(--blog-warn);
}

/* Pills (local to this card) */
.blog-pill {
  font-size: 12px;
  font-weight: 950;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--blog-border);
  background: rgba(15, 23, 42, 0.03);
  color: var(--blog-text-main);
  white-space: nowrap;
}

.theme-dark .blog-pill,
[data-theme="dark"] .blog-pill {
  background: rgba(148, 163, 184, 0.10);
}

@media (prefers-color-scheme: dark) {
  .blog-pill {
    background: rgba(148, 163, 184, 0.10);
  }
}

.blog-pill--on {
  border-color: rgba(34, 197, 94, 0.35);
  background: var(--blog-ok);
}

.blog-pill--warn {
  border-color: rgba(245, 158, 11, 0.35);
  background: var(--blog-warn);
}

.blog-pill--paused {
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(99, 102, 241, 0.14);
}

.blog-pill--off {
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(148, 163, 184, 0.12);
}

.blog-pill--bad {
  border-color: rgba(239, 68, 68, 0.35);
  background: var(--blog-bad);
}

.blog-pill--soft {
  border-color: var(--blog-border);
  background: rgba(148, 163, 184, 0.10);
}

/* ------------------------------------------
   Status banner
------------------------------------------- */

.blog-statusBanner {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--blog-border);
  background: var(--blog-surface-2);

  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.blog-statusBanner--ok {
  border-color: rgba(34, 197, 94, 0.32);
  background: var(--blog-ok);
}

.blog-statusBanner--warn {
  border-color: rgba(245, 158, 11, 0.30);
  background: var(--blog-warn);
}

.blog-statusBanner--bad {
  border-color: rgba(239, 68, 68, 0.30);
  background: var(--blog-bad);
}

.blog-statusBanner--neutral {
  border-color: var(--blog-border);
  background: rgba(148, 163, 184, 0.10);
}

.blog-statusTitle {
  font-weight: 950;
  color: var(--blog-text-strong);
  margin-bottom: 4px;
}

.blog-statusBody {
  font-weight: 750;
  color: var(--blog-text-main);
  opacity: 0.92;
  line-height: 1.35;
}

.blog-statusMeta {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 900;
  color: var(--blog-text-muted);
}

/* ------------------------------------------
   Controls
------------------------------------------- */

.blog-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
  min-width: 0;
}

.blog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.blog-field-search {
  grid-column: span 2;
}

.blog-label {
  font-size: 12px;
  font-weight: 900;
  color: var(--blog-text-muted);
}

.blog-input {
  height: 44px;
  border-radius: 14px;
  padding: 0 12px;
  border: 1px solid var(--blog-border);
  background: var(--blog-surface);
  color: var(--blog-text-main);
  font-weight: 850;
  min-width: 0;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;

  /* prevents long values from pushing layout */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blog-input:focus {
  border-color: rgba(34, 197, 94, 0.65);
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.14);
}

.blog-controlActions {
  grid-column: span 2;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-wrap: wrap;
  min-width: 0;
}

/* ------------------------------------------
   List
------------------------------------------- */

.blog-list {
  margin-top: 14px;
  display: grid;
  gap: 12px;
  min-width: 0;
}

.blog-empty {
  opacity: 0.78;
  font-weight: 850;
  color: var(--blog-text-muted);

  overflow-wrap: anywhere;
  word-break: break-word;
}

/* ------------------------------------------
   Event rows
   Goal: clean on dark mode, no milky gradients,
   and never spill or cut content.
------------------------------------------- */

.blog-evt {
  border: 1px solid var(--blog-border-soft);
  background: linear-gradient(180deg, rgba(148, 163, 184, 0.10), rgba(15, 23, 42, 0.04));
  border-radius: 18px;
  padding: 12px 14px;

  min-width: 0;
  overflow: hidden;
}

.theme-dark .blog-evt,
[data-theme="dark"] .blog-evt {
  background: linear-gradient(180deg, rgba(148, 163, 184, 0.12), rgba(2, 6, 23, 0.18));
}

@media (prefers-color-scheme: dark) {
  .blog-evt {
    background: linear-gradient(180deg, rgba(148, 163, 184, 0.12), rgba(2, 6, 23, 0.18));
  }
}

.blog-evt--warn {
  border-color: rgba(245, 158, 11, 0.24);
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.14), rgba(2, 6, 23, 0.16));
}

.blog-evt--error {
  border-color: rgba(239, 68, 68, 0.24);
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.14), rgba(2, 6, 23, 0.16));
}

.blog-evtTop {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.blog-evtLeft {
  min-width: 0;
}

.blog-evtTitle {
  font-weight: 950;
  color: var(--blog-text-strong);
  line-height: 1.2;

  /* allow wrap without spilling */
  overflow-wrap: anywhere;
  word-break: break-word;
}

.blog-evtSub {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 850;
  color: var(--blog-text-muted);

  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;

  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
}

.blog-evtDot {
  opacity: 0.7;
}

.blog-evtChip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--blog-border);
  background: rgba(148, 163, 184, 0.10);
  color: var(--blog-text-main);

  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blog-evtChip--soft {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.26);
}

.blog-level {
  font-size: 12px;
  font-weight: 950;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--blog-border);
  background: rgba(148, 163, 184, 0.10);
  color: var(--blog-text-main);
  white-space: nowrap;
}

.blog-level--info {
  border-color: rgba(34, 197, 94, 0.28);
  background: rgba(34, 197, 94, 0.12);
}

.blog-level--warn {
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.12);
}

.blog-level--error {
  border-color: rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.12);
}

.blog-evtDetails {
  margin-top: 10px;
  min-width: 0;
}

.blog-evtDetails details {
  border-top: 1px solid var(--blog-border-soft);
  padding-top: 10px;
  min-width: 0;
}

.blog-evtDetails summary {
  cursor: pointer;
  font-weight: 900;
  color: var(--ustock-green-main, #22c55e);
  user-select: none;

  /* keep long summary from overflowing */
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Pre blocks: readable in dark mode, never spill */
.blog-pre {
  margin: 10px 0 0;
  font-size: 12px;
  white-space: pre-wrap;

  background: rgba(148, 163, 184, 0.10);
  border: 1px solid var(--blog-border-soft);
  border-radius: 14px;
  padding: 10px;

  overflow: auto;
  max-width: 100%;

  /* prevent long tokens from forcing horizontal overflow */
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Raw modal grid */
.blog-rawGrid {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px 12px;
  margin-top: 10px;
  min-width: 0;
}

.blog-rawLabel {
  font-size: 12px;
  font-weight: 950;
  color: var(--blog-text-muted);

  overflow-wrap: anywhere;
  word-break: break-word;
}

/* ------------------------------------------
   Mobile
------------------------------------------- */

@media (max-width: 768px) {
  .blog-controls {
    grid-template-columns: 1fr;
  }

  .blog-field-search {
    grid-column: span 1;
  }

  .blog-controlActions {
    grid-column: span 1;
    justify-content: stretch;
  }

  .blog-controlActions .mBtn {
    width: 100%;
  }

  .blog-rawGrid {
    grid-template-columns: 1fr;
  }
}