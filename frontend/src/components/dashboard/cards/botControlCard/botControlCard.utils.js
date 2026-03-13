// frontend/src/components/dashboard/cards/botControlCard/botControlCard.utils.js

import { safeStr } from "../../../../lib/format/botFormat.js";

/**
 * Returns true if the provided selected bot id exists in the available bot list.
 *
 * @param {Array<{ id?: string, name?: string }>} available
 * @param {string | null | undefined} selectedId
 * @returns {boolean}
 */
export function selectionExists(available, selectedId) {
  if (!selectedId) return false;

  return (available || []).some(
    (bot) => safeStr(bot?.id, "") === safeStr(selectedId, "")
  );
}

/**
 * Returns true when the current error modal content represents a
 * bot-unavailable case.
 *
 * @param {boolean} errModalOpen
 * @param {{ title?: string, message?: string, detail?: string } | null | undefined} errModal
 * @returns {boolean}
 */
export function isBotUnavailableError(errModalOpen, errModal) {
  if (!errModalOpen) return false;

  const text = String(
    errModal?.title || errModal?.message || errModal?.detail || ""
  );

  return /bot unavailable|bot not found|unavailable/i.test(text);
}

/**
 * Returns a stable select id for the control.
 *
 * @param {string | number | null | undefined} storageScope
 * @returns {string}
 */
export function getBotSelectId(storageScope) {
  const scope = safeStr(storageScope, "default");
  return `bot-control-select-${scope}`;
}