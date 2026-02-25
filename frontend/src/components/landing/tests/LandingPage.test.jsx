// src/components/landing/tests/LandingPage.test.jsx
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";

import LandingPage from "../../landing/LandingPage";

// Mock useNavigate so we can assert redirects
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext so NavBar/AppShell can call useAuth() without needing AuthProvider
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    logout: vi.fn(),
  }),
}));

// ✅ Make Modal test-friendly (render title + footer + children when open)
vi.mock("../../common/Modal", () => ({
  default: ({ open, title, onClose, footer, children }) =>
    open ? (
      <div role="dialog" aria-label={typeof title === "string" ? title : "modal"}>
        <div>{title}</div>
        <div>{children}</div>
        <div>{footer}</div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

// ✅ Stabilize content so tests don’t break when copy changes
vi.mock("../../../content/landing/landingpage.content.ts", () => ({
  LANDING_PAGE_CONTENT: {
    copy: {
      hero: {
        subtitle: "U-Stock helps everyday users trade and invest with clarity.",
        ctas: {
          primary: "Sign in / Sign up",
          secondary: "Learn more",
        },
      },
      why: {
        title: "Why U-Stock?",
        body: "Because markets are noisy.",
        cards: [
          { tag: "01", title: "Clarity you can understand", body: "Readable signals." },
          { tag: "02", title: "Risk controls by default", body: "Guardrails first." },
          { tag: "03", title: "Transparency without oversharing", body: "Just the essentials." },
        ],
      },
      bigCard: {
        eyebrow: "Where this is going",
        titleLines: ["Level up your investments with", "Lucent"],
        subtitle: "A roadmap of what ships next.",
        roadmap: [
          { label: "Now", text: "Charts, snapshots, bot status + logs." },
          { label: "Next", text: "Paper trading + journaling." },
          { label: "Soon", text: "Guided automation." },
        ],
        ctas: {
          primary: "Get Started",
          roadmap: "Roadmap",
        },
      },
      modal: {
        title: "U-Stock roadmap",
        blocks: [
          { pill: "Now", text: "Dashboards and visibility." },
          { pill: "Next", text: "Paper trading tools." },
        ],
        note: "Early access is available.",
        footer: {
          close: "Close",
          earlyAccess: "Get early access",
        },
      },
    },
    assets: {
      heroIllustration: "hero.png",
      visionImage: "vision.png",
    },
  },
}));

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LandingPage />
    </MemoryRouter>
  );
}

describe("LandingPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders the hero heading, subtitle, and CTA buttons", () => {
    renderLanding();

    // ✅ New hero headline is portfolio-style
    expect(
      screen.getByRole("heading", { name: /hello,\s*i’m/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/u-stock helps everyday users trade and invest with clarity/i)
    ).toBeInTheDocument();

    // ✅ CTAs now: Sign in / Sign up, Watch Demo, Learn more
    expect(screen.getByRole("button", { name: /sign in \/ sign up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch demo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /learn more/i })).toBeInTheDocument();
  });

  it("renders the illustration image (headshot)", () => {
    renderLanding();

    // ✅ Right-side image is now a headshot
    expect(screen.getByAltText(/ericka james headshot/i)).toBeInTheDocument();
  });

  it("renders the 'Why U-Stock?' section and feature cards", () => {
    renderLanding();

    expect(screen.getByRole("heading", { name: /why u-stock\?/i })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /clarity you can understand/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /risk controls by default/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /transparency without oversharing/i })).toBeInTheDocument();
  });

  it("renders the big roadmap marketing card content (handles split <strong> text)", () => {
    renderLanding();

    expect(screen.getByText(/where this is going/i)).toBeInTheDocument();

    // title is split across lines with accent span, so match loosely
    expect(screen.getByRole("heading", { name: /level up your investments with/i })).toBeInTheDocument();

    // ✅ list items are <strong>Label:</strong> Text
    expect(screen.getByText(/^now:$/i)).toBeInTheDocument();
    expect(screen.getByText(/charts,\s*snapshots,\s*bot status \+ logs/i)).toBeInTheDocument();

    expect(screen.getByText(/^next:$/i)).toBeInTheDocument();
    expect(screen.getByText(/paper trading \+ journaling/i)).toBeInTheDocument();

    expect(screen.getByText(/^soon:$/i)).toBeInTheDocument();
    expect(screen.getByText(/guided automation/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^roadmap$/i })).toBeInTheDocument();
  });

  it("navigates to /auth when 'Sign in / Sign up' is clicked", () => {
    renderLanding();

    fireEvent.click(screen.getByRole("button", { name: /sign in \/ sign up/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("navigates to /auth when 'Get Started' is clicked", () => {
    renderLanding();

    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("opens the Roadmap modal, then navigates to /auth when 'Get early access' is clicked", () => {
    renderLanding();

    fireEvent.click(screen.getByRole("button", { name: /^roadmap$/i }));

    // Modal title should appear
    const modal = screen.getByRole("dialog", { name: /u-stock roadmap/i });
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText(/u-stock roadmap/i)).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: /get early access/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });
});