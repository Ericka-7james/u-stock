// src/components/layout/tests/NavBar.test.jsx
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NavBar from "../NavBar";

// ✅ Mock AuthContext to control logged-in vs logged-out
const mockLogout = vi.fn();

let authState = {
  user: null,
  logout: mockLogout,
};

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

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
    mockLogout.mockClear();
    authState = { user: null, logout: mockLogout };
  });

  it("renders brand, side-nav links, and topbar controls (logged out)", () => {
    renderNavBar({ route: "/" });

    // Brand
    expect(screen.getByText(/lucent financial/i)).toBeInTheDocument();
    expect(screen.getByText(/financial intelligence/i)).toBeInTheDocument();

    // ✅ Scope to SIDE NAV menu to avoid collisions with topbar icon links
    const sideNav = document.querySelector("aside.side-nav");
    expect(sideNav).toBeTruthy();

    const sideNavMenu = sideNav.querySelector("nav.side-nav-menu");
    expect(sideNavMenu).toBeTruthy();

    const nav = within(sideNavMenu);

    expect(nav.getByRole("link", { name: /^dashboard$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^market & logs$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^market baselines$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^connected brokers$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^about$/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^feedback$/i })).toBeInTheDocument();

    // Topbar controls exist
    const topbar = document.querySelector("header.topbar");
    expect(topbar).toBeTruthy();
    const top = within(topbar);

    expect(top.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
    expect(top.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();

    // Topbar icon links (aria-label)
    expect(top.getByRole("link", { name: /^about$/i })).toBeInTheDocument();
    expect(top.getByRole("link", { name: /^feedback$/i })).toBeInTheDocument();

    // Footer credit
    expect(screen.getByText(/made by ericka james/i)).toBeInTheDocument();

    // Logged out: no Sign out button (side nav) and no user menu
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open user menu/i })).not.toBeInTheDocument();
  });

  it("applies active class to Market & Logs when on /data-sources", () => {
    renderNavBar({ route: "/data-sources" });

    // Scope to side nav menu so we pick the correct link consistently
    const sideNavMenu = document.querySelector("nav.side-nav-menu");
    const nav = within(sideNavMenu);

    const link = nav.getByRole("link", { name: /^market & logs$/i });
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
});
