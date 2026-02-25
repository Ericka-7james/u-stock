// frontend/src/components/layout/tests/NavBar.test.jsx
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NavBar from "../NavBar";

// ---- Mocks ----
const mockLogout = vi.fn();
let authState = { user: null, logout: mockLogout };

// ✅ IMPORTANT: NavBar now imports from authContextBase.js
vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: () => authState,
}));

// Stub AuthRequiredModal so we can assert it opens
vi.mock("../../common/AuthRequiredModal", () => ({
  default: ({
    open,
    title,
    message,
    primaryLabel,
    secondaryLabel,
    onClose,
    onPrimary,
  }) =>
    open ? (
      <div role="dialog" aria-label="auth-required">
        <h2>{title}</h2>
        <p>{message}</p>
        <button type="button" onClick={onPrimary}>
          {primaryLabel}
        </button>
        <button type="button" onClick={onClose}>
          {secondaryLabel}
        </button>
      </div>
    ) : null,
}));

// Avoid asset import issues in tests
vi.mock("../../../assets/icons/LucentAppIcon.png", () => ({ default: "lucent.png" }));

function renderNavBar({
  route = "/",
  navOpen = false,
  userMenuOpen = false,
  isDark = false,
  setNavOpen = vi.fn(),
  setUserMenuOpen = vi.fn(),
  onToggleTheme = vi.fn(),
} = {}) {
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <NavBar
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />
    </MemoryRouter>
  );

  return { ...utils, setNavOpen, setUserMenuOpen, onToggleTheme };
}

describe("NavBar", () => {
  beforeEach(() => {
    mockLogout.mockReset();
    authState = { user: null, logout: mockLogout };
  });

  it("renders brand, side-nav links, and topbar controls (logged out)", () => {
    renderNavBar({ route: "/" });

    const sideNav = document.querySelector("aside.side-nav");
    expect(sideNav).toBeTruthy();

    const brand = within(sideNav);
    expect(brand.getByText(/lucent financial/i)).toBeInTheDocument();
    expect(brand.getByText(/financial intelligence/i)).toBeInTheDocument();

    const sideNavMenu = document.querySelector("nav.side-nav-menu");
    expect(sideNavMenu).toBeTruthy();
    const nav = within(sideNavMenu);

    expect(nav.getByRole("link", { name: /^dashboard$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^market & logs$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^market baselines$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^connected brokers$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^about$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^feedback$/i })).toBeInTheDocument();

    const topbar = document.querySelector("header.topbar");
    expect(topbar).toBeTruthy();
    const top = within(topbar);

    expect(top.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
    expect(top.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();

    // topbar icon links (aria-label)
    expect(top.getByRole("link", { name: /^about$/i })).toBeInTheDocument();
    expect(top.getByRole("link", { name: /^feedback$/i })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open user menu/i })).not.toBeInTheDocument();
  });

  it("applies active class to Market & Logs when on /data-sources", () => {
    renderNavBar({ route: "/data-sources" });

    const sideNavMenu = document.querySelector("nav.side-nav-menu");
    const nav = within(sideNavMenu);

    const link = nav.getByRole("link", { name: /^market & logs$/i });
    expect(link.className).toMatch(/side-nav-item--active/);
  });

  it("applies active class to Market Baselines when on /index-funds", () => {
    renderNavBar({ route: "/index-funds" });

    const sideNavMenu = document.querySelector("nav.side-nav-menu");
    const nav = within(sideNavMenu);

    const link = nav.getByRole("link", { name: /^market baselines$/i });
    expect(link.className).toMatch(/side-nav-item--active/);
  });

  it("applies active class to Connected Brokers when on /connected-apps", () => {
    renderNavBar({ route: "/connected-apps" });

    const sideNavMenu = document.querySelector("nav.side-nav-menu");
    const nav = within(sideNavMenu);

    const link = nav.getByRole("link", { name: /^connected brokers$/i });
    expect(link.className).toMatch(/side-nav-item--active/);
  });

  it("has two About links and two Feedback links (side nav + topbar)", () => {
    renderNavBar({ route: "/" });

    const aboutLinks = screen.getAllByRole("link", { name: /^about$/i });
    expect(aboutLinks.length).toBeGreaterThanOrEqual(2);

    const feedbackLinks = screen.getAllByRole("link", { name: /^feedback$/i });
    expect(feedbackLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("blocks protected routes when logged out and shows AuthRequiredModal", async () => {
    const user = userEvent.setup();
    const setNavOpen = vi.fn();
    const setUserMenuOpen = vi.fn();

    renderNavBar({ route: "/", setNavOpen, setUserMenuOpen });

    const sideNavMenu = document.querySelector("nav.side-nav-menu");
    const nav = within(sideNavMenu);

    // click a protected link
    await user.click(nav.getByRole("link", { name: /^market & logs$/i }));

    // modal opens
    expect(await screen.findByRole("dialog", { name: "auth-required" })).toBeInTheDocument();

    // nav + user menu closed
    expect(setUserMenuOpen).toHaveBeenCalledWith(false);
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });

  it("shows Sign out (side nav) and user menu button when logged in", () => {
    authState = {
      user: { email: "test@example.com", avatar: "🦊" },
      logout: mockLogout,
    };

    renderNavBar({ route: "/" });

    // side nav sign out exists
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    // topbar user menu button exists
    expect(screen.getByRole("button", { name: /open user menu/i })).toBeInTheDocument();
  });

  it("calls onToggleTheme when theme toggle is clicked", async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();

    renderNavBar({ route: "/", onToggleTheme });

    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });
});