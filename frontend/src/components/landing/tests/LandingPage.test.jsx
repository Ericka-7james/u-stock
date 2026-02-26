// src/components/landing/tests/LandingPage.test.jsx
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock useNavigate so we can assert redirects
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ✅ Mock BOTH auth hooks so AppShell/NavBar can call useAuth safely
const mockAuth = {
  user: null,
  isAuthed: false,
  logout: vi.fn(),
  authFetch: vi.fn(),
  refreshSession: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
};

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: () => mockAuth,
}));

// ✅ Mock DashboardCard wrapper (keep children + basic semantics)
vi.mock("../../dashboard/cards/shared/DashboardCard.jsx", () => ({
  default: ({ as: Tag = "section", className = "", children }) => <Tag className={className}>{children}</Tag>,
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

// ✅ Mock all imported images so tests don't fail on asset imports
vi.mock("../../../assets/ericka-headshot.jpeg", () => ({ default: "headshot.jpg" }));
vi.mock("../../../assets/trusted-logos/jpmorgan-chase-trusted-gray.png", () => ({ default: "jpm.png" }));
vi.mock("../../../assets/trusted-logos/spelman-innovation-lab-trusted-gray.png", () => ({ default: "spelman.png" }));
vi.mock("../../../assets/trusted-logos/gpc-trusted-gray.png", () => ({ default: "gpc.png" }));
vi.mock("../../../assets/trusted-logos/mlt-trusted-gray.png", () => ({ default: "mlt.png" }));
vi.mock("../../../assets/icons/LucentAppIcon.png", () => ({ default: "lucent.png" }));

// ✅ Stabilize content so tests don’t break when copy changes
vi.mock("../../../content/landing/landingpage.content.ts", () => ({
  LANDING_PAGE_CONTENT: {
    copy: {
      hero: {
        subtitle: "U-Stock helps everyday users trade and invest with clarity.",
        ctas: {
          primary: "Sign in / Sign up",
          secondary: "About",
          roadmap: "See roadmap",
        },
        metrics: [
          { top: "3", bottom: "Bots shipped" },
          { top: "120+", bottom: "Backtests run" },
        ],
      },
      workedAt: {
        ariaLabel: "Places I’ve worked",
        caption: "Trusted by teams and programs I’ve worked with.",
        tooltips: {
          jpm: "JPMorgan Chase",
          spelman: "Spelman Innovation Lab",
          gpc: "GPC",
          mlt: "MLT",
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

// ✅ IMPORTANT: import after mocks
import LandingPage from "../../landing/LandingPage";

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

    // tolerate unicode apostrophe in "I’m"
    expect(screen.getByRole("heading", { name: /hello,\s*i[’']m/i })).toBeInTheDocument();

    expect(screen.getByText(/u-stock helps everyday users trade and invest with clarity/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /sign in \/ sign up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see roadmap/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /about/i })).toBeInTheDocument();
  });

  it("renders the headshot image", () => {
    renderLanding();
    expect(screen.getByAltText(/ericka james headshot/i)).toBeInTheDocument();
  });

  it("renders the worked-at logo strip with tooltips", () => {
    renderLanding();

    // strip is labeled by ariaLabel from content
    expect(screen.getByLabelText(/places i’ve worked/i)).toBeInTheDocument();

    // logos are present by tooltip text (used as alt)
    expect(screen.getByAltText(/jpmorgan chase/i)).toBeInTheDocument();
    expect(screen.getByAltText(/spelman innovation lab/i)).toBeInTheDocument();
    expect(screen.getByAltText(/^gpc$/i)).toBeInTheDocument();
    expect(screen.getByAltText(/^mlt$/i)).toBeInTheDocument();

    expect(screen.getByText(/trusted by teams and programs/i)).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: /level up your investments with/i })).toBeInTheDocument();

    // Strong label + text are split nodes, so assert separately
    expect(screen.getByText(/^now:$/i)).toBeInTheDocument();
    expect(screen.getByText(/charts,\s*snapshots,\s*bot status \+ logs/i)).toBeInTheDocument();

    expect(screen.getByText(/^next:$/i)).toBeInTheDocument();
    expect(screen.getByText(/paper trading \+ journaling/i)).toBeInTheDocument();

    expect(screen.getByText(/^soon:$/i)).toBeInTheDocument();
    expect(screen.getByText(/guided automation/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^roadmap$/i })).toBeInTheDocument();
  });

  it("navigates to /auth when primary CTA is clicked", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /sign in \/ sign up/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("navigates to /about when About CTA is clicked", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /about/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/about");
  });

  it("opens the Roadmap modal from the hero CTA, then navigates to /auth when 'Get early access' is clicked", () => {
    renderLanding();

    fireEvent.click(screen.getByRole("button", { name: /see roadmap/i }));

    const modal = screen.getByRole("dialog", { name: /u-stock roadmap/i });
    expect(modal).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: /get early access/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("opens the Roadmap modal from the big card CTA", () => {
    renderLanding();

    fireEvent.click(screen.getByRole("button", { name: /^roadmap$/i }));

    expect(screen.getByRole("dialog", { name: /u-stock roadmap/i })).toBeInTheDocument();
    expect(screen.getByText(/dashboards and visibility/i)).toBeInTheDocument();
  });
});