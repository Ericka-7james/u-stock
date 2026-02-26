// frontend/src/content/errorCatalog.js

import accountCreated from "../../assets/modal/AccountCreated.png";
import errorSquirrel from "../../assets/modal/ErrorSquirrel.png";

/**
 * Centralized UI presets (copy + image + default action) for known error keys.
 * Logic lives in lib/errorMessages.jsx.
 */

export const ERROR_KEYS = /** @type {const} */ ({
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  DUPLICATE: "DUPLICATE",
  ALPACA_FEED_FORBIDDEN: "ALPACA_FEED_FORBIDDEN",
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  UNKNOWN: "UNKNOWN",
});

export const ERROR_PRESETS = {
  [ERROR_KEYS.DUPLICATE]: {
    title: "Account already exists",
    body: "That email or phone number is already in use.",
    subtitle: "Try signing in instead, or use a different email/phone.",
    image: accountCreated,
    action: { label: "Sign in", href: "/auth" },
  },

  [ERROR_KEYS.NOT_AUTHENTICATED]: {
    title: "Session expired",
    body: "You’re signed out or your session expired.",
    subtitle: "Sign in again, then retry.",
    image: errorSquirrel,
    action: { label: "Sign in", href: "/auth" },
  },

  [ERROR_KEYS.ALPACA_FEED_FORBIDDEN]: {
    title: "Alpaca data feed not available",
    body: "Your Alpaca account doesn’t have access to this market data feed (often SIP).",
    subtitle: "Use IEX feed for dev, or upgrade your Alpaca market data plan.",
    image: errorSquirrel,
    action: { label: "Connected Apps", href: "/connected-apps" },
  },

  [ERROR_KEYS.NETWORK_ERROR]: {
    title: "Connection problem",
    body: "We couldn’t reach the server.",
    subtitle: "Check your internet connection and try again.",
    image: errorSquirrel,
    action: null,
  },

  [ERROR_KEYS.SERVER_ERROR]: {
    title: "Server hiccup",
    body: "Something went wrong on our side.",
    subtitle: "Refresh and try again. If it keeps happening, sign out/in or write feedback",
    image: errorSquirrel,
    action: null,
  },

  [ERROR_KEYS.UNKNOWN]: {
    title: "Something went wrong",
    body: "We hit an unexpected issue.",
    subtitle: "Please try again.",
    image: errorSquirrel,
    action: null,
  },
};
