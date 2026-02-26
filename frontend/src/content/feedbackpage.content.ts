// frontend/src/content/feedbackpage.content.ts
export const FEEDBACK_PAGE_COPY = {
  config: {
    // endpoint path only (component can prefix with API_BASE/API_PREFIX)
    endpointPath: "/feedback",

    // word count validation
    wordLimit: 250,
    minWords: 3,

    // request safety
    requestTimeoutMs: 12_000,

    // captcha behavior
    captcha: {
      siteKeyEnv: "VITE_TURNSTILE_SITE_KEY",
      // require captcha in non-dev + non-test
      requireInProdOnly: true,
    },

    // ui defaults
    defaults: {
      feedbackType: "feature",
    },
  },

  header: {
    title: "Feedback",
    subtitle: "Found a bug, have a question, or want a feature? Send it here.",
  },

  fields: {
    honeypotLabel: "Website",
    name: {
      label: "Name (optional)",
      placeholder: "Your name",
    },
    email: {
      label: "Email (optional)",
      placeholder: "you@example.com",
      hint: "If you want a reply, include an email.",
    },
    type: {
      label: "Type",
      options: {
        feature: "Feature request",
        bug: "Bug report",
        question: "Question",
        other: "Other",
      },
    },
    message: {
      label: "Message",
      placeholder: "Tell me what you’re trying to do, what happened, and what you expected.",
      footerHint: "Please avoid sensitive info (passwords, keys, etc.).",
      minWarnPrefix: "Add at least ",
      minWarnSuffix: " words.",
      maxWarnPrefix: "Keep it under ",
      maxWarnSuffix: " words.",
      counterSuffix: "words",
    },
  },

  buttons: {
    submitIdle: "Send feedback",
    submitLoading: "Sending…",
    clear: "Clear",
  },

  status: {
    sent: "Sent. Thank you!",
    failed: "Couldn’t send feedback. Please try again.",
    timeout: "Timed out. Please try again.",
    captchaIncomplete: "Please complete the captcha.",
    captchaMissingKey: "Captcha misconfigured: missing VITE_TURNSTILE_SITE_KEY.",
    minWordsPrefix: "Please write at least ",
    minWordsSuffix: " words.",
    maxWordsPrefix: "Please keep it under ",
    maxWordsSuffix: " words.",
  },
} as const;