// frontend/src/content/error/errorCatalog.js

export const ERROR_KEYS = {
  // ...existing keys

  // ---------------------------
  // Signup (inline validation)
  // ---------------------------
  SIGNUP_NAME_REQUIRED: "signup_name_required",
  SIGNUP_EMAIL_INVALID: "signup_email_invalid",
  SIGNUP_PHONE_INVALID: "signup_phone_invalid",

  SIGNUP_PASSWORD_TOO_SHORT: "signup_password_too_short",
  SIGNUP_PASSWORD_NEEDS_UPPER: "signup_password_needs_upper",
  SIGNUP_PASSWORD_NEEDS_LOWER: "signup_password_needs_lower",
  SIGNUP_PASSWORD_NEEDS_NUMBER: "signup_password_needs_number",
  SIGNUP_PASSWORD_NEEDS_SPECIAL: "signup_password_needs_special",
  SIGNUP_PASSWORD_CONTAINS_EMAIL: "signup_password_contains_email",
  SIGNUP_PASSWORD_CONTAINS_USERNAME: "signup_password_contains_username",

  // ---------------------------
  // Signup (provider wiring)
  // ---------------------------
  SIGNUP_GOOGLE_NOT_CONFIGURED: "signup_google_not_configured",
  SIGNUP_FACEBOOK_NOT_CONFIGURED: "signup_facebook_not_configured",
  LOGIN_FALLBACK: "login_fallback",
};

export const ERROR_PRESETS = {
  // ...existing presets

  // Inline validation (these are “messages”, but using the same store keeps it centralized)
  [ERROR_KEYS.SIGNUP_NAME_REQUIRED]: {
    title: "Missing username",
    body: "Please enter your username.",
  },
  [ERROR_KEYS.SIGNUP_EMAIL_INVALID]: {
    title: "Invalid email",
    body: "Please enter a valid email address.",
  },
  [ERROR_KEYS.SIGNUP_PHONE_INVALID]: {
    title: "Invalid phone number",
    body: "Please enter a valid phone number (10–15 digits).",
  },

  [ERROR_KEYS.SIGNUP_PASSWORD_TOO_SHORT]: {
    title: "Weak password",
    body: "Password must be at least 12 characters long.",
  },
  [ERROR_KEYS.SIGNUP_PASSWORD_NEEDS_UPPER]: {
    title: "Weak password",
    body: "Password must include at least 1 uppercase letter.",
  },
  [ERROR_KEYS.SIGNUP_PASSWORD_NEEDS_LOWER]: {
    title: "Weak password",
    body: "Password must include at least 1 lowercase letter.",
  },
  [ERROR_KEYS.SIGNUP_PASSWORD_NEEDS_NUMBER]: {
    title: "Weak password",
    body: "Password must include at least 1 number.",
  },
  [ERROR_KEYS.SIGNUP_PASSWORD_NEEDS_SPECIAL]: {
    title: "Weak password",
    body: "Password must include at least 1 special character.",
  },
  [ERROR_KEYS.SIGNUP_PASSWORD_CONTAINS_EMAIL]: {
    title: "Weak password",
    body: "Password must not contain your email.",
  },
  [ERROR_KEYS.SIGNUP_PASSWORD_CONTAINS_USERNAME]: {
    title: "Weak password",
    body: "Password must not contain your username.",
  },

  [ERROR_KEYS.SIGNUP_GOOGLE_NOT_CONFIGURED]: {
    title: "Google signup unavailable",
    body: "Google signup is not configured yet.",
  },
  [ERROR_KEYS.SIGNUP_FACEBOOK_NOT_CONFIGURED]: {
    title: "Facebook signup unavailable",
    body: "Facebook signup is not configured yet.",
  },
  [ERROR_KEYS.LOGIN_FALLBACK]: {
    title: "Couldn’t sign you in",
    body: "Something went wrong. Please try again.",
  },
};