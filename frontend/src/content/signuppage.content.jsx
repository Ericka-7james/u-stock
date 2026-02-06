// frontend/src/content/signuppage.content.jsx

export const SIGNUP_PAGE_CONTENT = {
  header: {
    title: "Create account",
    subtitle: "Sign up to start using U-Stock.",
  },

  fields: {
    usernamePlaceholder: "Enter your username",
    emailPlaceholder: "Enter your email",
    phonePlaceholder: "(555) 555-5555 (optional)",
    passwordPlaceholder: "Create password",
  },

  avatar: {
    label: "Avatar",
    options: ["📈", "📊", "🤖", "💡"],
  },

  buttons: {
    submit: "Sign up",
    submitLoading: "Creating account…",
    google: "Google",
    facebook: "Facebook",
  },

  divider: {
    text: "or sign up with",
  },

  footer: {
    text: "Already have an account?",
    linkText: "Sign in",
  },

  duplicateAccountModal: {
    title: "Account already exists",
    body: "That email or phone number is already in use.",
    subtitle: "Try signing in instead, or use a different email/phone.",
    actionLabel: "Sign in",
    actionHref: "/auth",
  },
};
