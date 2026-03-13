// frontend/src/hooks/bots/botControlCard/botControlCard.constants.js

export const LAST_SELECTED_BOT_KEY = "ustock:last_bot_id_v1";

export const ARM_GRACE_MS = 8_000;
export const DISARM_GRACE_MS = 8_000;
export const START_GRACE_MS = 12_000;
export const PAUSE_GRACE_MS = 8_000;

export const STATUS_THROTTLE_MS = 1_000;

/**
 * Polling cadence.
 *
 * Keep this conservative so the frontend does not aggressively spam backend
 * status routes while still feeling responsive during active transitions.
 */
export const POLL_TRANSITION_MS = 5_000;
export const POLL_IDLE_MS = 15_000;
export const LOG_POLL_MS = 10_000;