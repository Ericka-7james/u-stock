// frontend/src/components/pages/tests/FeedbackPage.test.jsx
import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Turnstile mock: fine to keep, but note:
 * - In non-prod (import.meta.env.PROD === false) captchaRequired is usually false,
 *   so token isn't required and turnstile_token will be "" in the POST body.
 */
vi.mock("react-turnstile", () => ({
  default: (props) => {
    useEffect(() => {
      props?.onVerify?.("test-token");
    }, []);
    return <div data-testid="turnstile" />;
  },
}));

vi.mock("../../layout/AppShell", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("../../common/PageHeaderCard", () => ({
  default: ({ title, subtitle, children }) => (
    <section>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../../config/config", () => ({
  API_BASE: "http://test.local",
  API_PREFIX: "/api",
}));

/**
 * Default COPY mock matches your real behavior:
 * captcha.requireInProdOnly = true (captcha only required in prod)
 */
vi.mock("../../../content/pages/feedbackpage.content.ts", () => ({
  FEEDBACK_PAGE_COPY: {
    header: { title: "Feedback", subtitle: "Tell us what you think" },
    config: {
      endpointPath: "/feedback",
      requestTimeoutMs: 2500,
      wordLimit: 250,
      minWords: 3,
      defaults: { feedbackType: "feature" },
      captcha: { requireInProdOnly: true, siteKeyEnv: "VITE_TURNSTILE_SITE_KEY" },
    },
    fields: {
      honeypotLabel: "Company",
      name: { label: "Name", placeholder: "Your name" },
      email: { label: "Email", placeholder: "you@example.com", hint: "Optional" },
      type: {
        label: "Feedback Type",
        options: { feature: "Feature", bug: "Bug", question: "Question", other: "Other" },
      },
      message: {
        label: "Message",
        placeholder: "Write your feedback…",
        counterSuffix: "words",
        minWarnPrefix: "Please enter at least ",
        minWarnSuffix: " words.",
        maxWarnPrefix: "Please keep it under ",
        maxWarnSuffix: " words.",
        footerHint: "We read everything.",
      },
    },
    buttons: { submitIdle: "Send feedback", submitLoading: "Sending…", clear: "Clear" },
    status: {
      sent: "Sent! Thank you.",
      failed: "Failed to send.",
      timeout: "Request timed out.",
      captchaIncomplete: "Please complete the captcha.",
      captchaMissingKey: "Captcha key missing: VITE_TURNSTILE_SITE_KEY",
      minWordsPrefix: "Please enter at least ",
      minWordsSuffix: " words.",
      maxWordsPrefix: "Please keep it under ",
      maxWordsSuffix: " words.",
    },
  },
}));

async function renderFreshPage() {
  const mod = await import("../FeedbackPage");
  const FeedbackPage = mod.default;

  return render(
    <MemoryRouter>
      <FeedbackPage />
    </MemoryRouter>
  );
}

describe("FeedbackPage", () => {
  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());

    // Default: key exists (but in non-prod it won't be required anyway)
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test_site_key");

    // Ensure fresh imports see current env
    vi.resetModules();

    const { useAuth } = await import("../../../context/authContextBase.js");
    useAuth.mockReturnValue({
      user: null,
      isAuthed: false,
      refreshSession: vi.fn(),
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the feedback form and fields", async () => {
    await renderFreshPage();

    expect(screen.getByRole("heading", { name: /feedback/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/feedback type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send feedback/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("disables submit until message has at least minWords", async () => {
    await renderFreshPage();

    const submit = screen.getByRole("button", { name: /send feedback/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Too short" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "This is enough" } });
    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  it("submits feedback successfully and shows success message", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await renderFreshPage();

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Ericka" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "ericka@example.com" } });
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "This dashboard is clean" } });

    const submit = screen.getByRole("button", { name: /send feedback/i });
    await waitFor(() => expect(submit).not.toBeDisabled());

    fireEvent.click(submit);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("http://test.local/api/feedback");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);

    // ✅ Non-prod behavior: captcha not required, so token is intentionally blank
    expect(body.turnstile_token).toBe("");

    expect(await screen.findByText(/sent!\s*thank you\./i)).toBeInTheDocument();
  });

  it("shows server error when submission fails", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    });

    await renderFreshPage();

    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Something broke badly" } });

    const submit = screen.getByRole("button", { name: /send feedback/i });
    await waitFor(() => expect(submit).not.toBeDisabled());

    fireEvent.click(submit);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it("honeypot filled short-circuits and shows sent without calling fetch", async () => {
    await renderFreshPage();

    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "bots-only-field" } });
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "This is enough words" } });

    const submit = screen.getByRole("button", { name: /send feedback/i });
    await waitFor(() => expect(submit).not.toBeDisabled());

    fireEvent.click(submit);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await screen.findByText(/sent!\s*thank you\./i)).toBeInTheDocument();
  });

  it("clear button resets message + status", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await renderFreshPage();

    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "This is enough words" } });

    const submit = screen.getByRole("button", { name: /send feedback/i });
    await waitFor(() => expect(submit).not.toBeDisabled());

    fireEvent.click(submit);
    expect(await screen.findByText(/sent!\s*thank you\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.getByLabelText(/^message$/i)).toHaveValue("");
    expect(screen.queryByText(/sent!\s*thank you\./i)).not.toBeInTheDocument();
  });

  it("captcha-required mode: missing SITE_KEY shows missing key warning and submit stays disabled", async () => {
    // Force captchaRequired without needing import.meta.env.PROD === true
    vi.resetModules();
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");

    vi.doMock("../../../content/pages/feedbackpage.content.ts", () => ({
      FEEDBACK_PAGE_COPY: {
        header: { title: "Feedback", subtitle: "Tell us what you think" },
        config: {
          endpointPath: "/feedback",
          requestTimeoutMs: 2500,
          wordLimit: 250,
          minWords: 3,
          defaults: { feedbackType: "feature" },
          // ✅ Force captcha always required for this test
          captcha: { requireInProdOnly: false, siteKeyEnv: "VITE_TURNSTILE_SITE_KEY" },
        },
        fields: {
          honeypotLabel: "Company",
          name: { label: "Name", placeholder: "Your name" },
          email: { label: "Email", placeholder: "you@example.com", hint: "Optional" },
          type: {
            label: "Feedback Type",
            options: { feature: "Feature", bug: "Bug", question: "Question", other: "Other" },
          },
          message: {
            label: "Message",
            placeholder: "Write your feedback…",
            counterSuffix: "words",
            minWarnPrefix: "Please enter at least ",
            minWarnSuffix: " words.",
            maxWarnPrefix: "Please keep it under ",
            maxWarnSuffix: " words.",
            footerHint: "We read everything.",
          },
        },
        buttons: { submitIdle: "Send feedback", submitLoading: "Sending…", clear: "Clear" },
        status: {
          sent: "Sent! Thank you.",
          failed: "Failed to send.",
          timeout: "Request timed out.",
          captchaIncomplete: "Please complete the captcha.",
          captchaMissingKey: "Captcha key missing: VITE_TURNSTILE_SITE_KEY",
          minWordsPrefix: "Please enter at least ",
          minWordsSuffix: " words.",
          maxWordsPrefix: "Please keep it under ",
          maxWordsSuffix: " words.",
        },
      },
    }));

    await renderFreshPage();

    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "This is enough words" } });

    const submit = screen.getByRole("button", { name: /send feedback/i });
    expect(submit).toBeDisabled();

    // env var name is rendered inside <code> in the warning block
    expect(screen.getByText("VITE_TURNSTILE_SITE_KEY")).toBeInTheDocument();
  });
});