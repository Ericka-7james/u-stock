// src/content/authpage.content.ts

export const AUTH_PAGE_COPY = {
  left: {
    title: "Welcome back",
    fields: {
      emailPlaceholder: "Email",
      passwordPlaceholder: "Password",
    },
    submit: {
      idle: "Sign In →",
      loading: "Signing in…",
    },
    alt: {
      prefix: "New here? ",
      cta: "Create an account →",
    },
  },

  right: {
    title: "U-Stock Radar Suite",
    description:
      "Sign up to see your market dashboard, signals, and sentiment in one place.",
    cta: "Sign Up",
  },

  errors: {
    fallback: "Unable to sign in",
  },
} as const;
