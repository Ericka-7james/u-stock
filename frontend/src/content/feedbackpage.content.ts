// src/content/feedbackpage.content.ts
export const FEEDBACK_PAGE_COPY = {
  header: {
    title: "Feedback",
    subtitle:
      "Share ideas, report issues, or ask questions about how U-Stock works. Messages here will be routed straight to my inbox.",
  },

  fields: {
    honeypotLabel: "Do not fill this out:",
    name: {
      label: "Name",
      placeholder: "Your name",
    },
    email: {
      label: "Contact email",
      placeholder: "you@example.com",
      hint: "I'll use this if I need to follow up about your feedback.",
    },
    type: {
      label: "Feedback type",
      options: {
        feature: "Feature idea",
        bug: "Bug report",
        question: "Question",
        other: "Something else",
      },
    },
    message: {
      label: "Message",
      placeholder: "Tell me what you’d like to learn, improve, or fix in U-Stock.",
      footerHint: "Think of this as your suggestion box. I use these notes to decide what to build next.",
      minWarnPrefix: "Add a bit more detail (min ",
      minWarnSuffix: " words).",
      maxWarnPrefix: "Please shorten your message (max ",
      maxWarnSuffix: " words).",
    },
  },

  buttons: {
    submitIdle: "Send feedback",
    submitLoading: "Sending...",
    clear: "Clear",
  },

  status: {
    sent: "Sent! Thank you.",
    minWordsPrefix: "Please enter at least ",
    minWordsSuffix: " words.",
    maxWordsPrefix: "Please keep your message under ",
    maxWordsSuffix: " words.",
    captchaIncomplete: "Please complete the captcha.",
    captchaMissingKey: "Captcha is required in production but VITE_TURNSTILE_SITE_KEY is missing.",
    timeout: "Request timed out. Backend didn’t respond.",
    failed: "Failed to send feedback.",
  },
} as const;
