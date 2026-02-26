// frontend/src/components/layout/tests/NavBar.test.jsx
import React from "react";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import NavBar from "../NavBar";

// --------------------
// Mocks
// --------------------
const mockLogout = vi.fn();
let authState = { user: null, logout: mockLogout };

// NavBar imports from authContextBase.js
vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: () => authState,
}));

// Stub AuthRequiredModal so we can assert open/close + click handlers
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
vi.mock("../../../assets/icons/LucentAppIcon.png", () => ({
  default: "lucent.png",
}));

// Mock react-router navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
    mockNavigate.mockReset();
    authState = { user: null, logout: mockLogout };
  });

  afterEach(() => {
    cleanup(); // ✅ ensures we don't have multiple NavBars in the DOM across tests
    vi.clearAllMocks();
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

    // logged out: no sign out + no avatar menu
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open user menu/i })).not.toBeInTheDocument();
  });

  // ✅ Split route/active checks so we never accidentally read from an older render
  it("applies active class to Market & Logs when on /data-sources", () => {
    renderNavBar({ route: "/data-sources" });
    const menu = within(document.querySelector("nav.side-nav-menu"));
    expect(menu.getByRole("link", { name: /^market & logs$/i }).className).toMatch(
      /side-nav-item--active/
    );
  });

  it("applies active class to Market Baselines when on /index-funds", () => {
    renderNavBar({ route: "/index-funds" });
    const menu = within(document.querySelector("nav.side-nav-menu"));
    expect(menu.getByRole("link", { name: /^market baselines$/i }).className).toMatch(
      /side-nav-item--active/
    );
  });

  it("applies active class to Connected Brokers when on /connected-apps", () => {
    renderNavBar({ route: "/connected-apps" });
    const menu = within(document.querySelector("nav.side-nav-menu"));
    expect(menu.getByRole("link", { name: /^connected brokers$/i }).className).toMatch(
      /side-nav-item--active/
    );
  });

  it("applies active class to About when on /about", () => {
    renderNavBar({ route: "/about" });
    const menu = within(document.querySelector("nav.side-nav-menu"));
    expect(menu.getByRole("link", { name: /^about$/i }).className).toMatch(
      /side-nav-item--active/
    );
  });

  it("applies active class to Feedback when on /feedback", () => {
    renderNavBar({ route: "/feedback" });
    const menu = within(document.querySelector("nav.side-nav-menu"));
    expect(menu.getByRole("link", { name: /^feedback$/i }).className).toMatch(
      /side-nav-item--active/
    );
  });

  it("has About and Feedback links in both side nav and topbar", () => {
    renderNavBar({ route: "/" });
    expect(screen.getAllByRole("link", { name: /^about$/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("link", { name: /^feedback$/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("blocks protected routes when logged out and opens AuthRequiredModal", async () => {
    const user = userEvent.setup();
    const setNavOpen = vi.fn();
    const setUserMenuOpen = vi.fn();

    renderNavBar({ route: "/", setNavOpen, setUserMenuOpen });

    const nav = within(document.querySelector("nav.side-nav-menu"));
    await user.click(nav.getByRole("link", { name: /^market & logs$/i }));

    expect(await screen.findByRole("dialog", { name: "auth-required" })).toBeInTheDocument();
    expect(setUserMenuOpen).toHaveBeenCalledWith(false);
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });

  it("clicking Sign in in AuthRequiredModal navigates to /auth", async () => {
    const user = userEvent.setup();

    renderNavBar({ route: "/" });
    const nav = within(document.querySelector("nav.side-nav-menu"));

    await user.click(nav.getByRole("link", { name: /^market & logs$/i }));
    const modal = await screen.findByRole("dialog", { name: "auth-required" });
    expect(modal).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: /sign in/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("ESC closes nav, user menu, and auth modal", () => {
    const setNavOpen = vi.fn();
    const setUserMenuOpen = vi.fn();

    renderNavBar({
      route: "/",
      navOpen: true,
      userMenuOpen: true,
      setNavOpen,
      setUserMenuOpen,
    });

    // Open auth modal via protected click
    const nav = within(document.querySelector("nav.side-nav-menu"));
    fireEvent.click(nav.getByRole("link", { name: /^market & logs$/i }));
    expect(screen.getByRole("dialog", { name: "auth-required" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(setNavOpen).toHaveBeenCalledWith(false);
    expect(setUserMenuOpen).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog", { name: "auth-required" })).not.toBeInTheDocument();
  });

  it("renders overlay when navOpen is true and overlay click closes nav", async () => {
    const user = userEvent.setup();
    const setNavOpen = vi.fn();

    renderNavBar({ navOpen: true, setNavOpen });

    const overlay = document.querySelector(".nav-overlay");
    expect(overlay).toBeTruthy();

    await user.click(overlay);
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });

  it("hamburger toggles navOpen and closes user menu", async () => {
    const user = userEvent.setup();
    const setNavOpen = vi.fn();
    const setUserMenuOpen = vi.fn();

    renderNavBar({ navOpen: false, userMenuOpen: true, setNavOpen, setUserMenuOpen });

    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(setUserMenuOpen).toHaveBeenCalledWith(false);
    expect(setNavOpen).toHaveBeenCalled();
    // can't assert exact boolean due to functional updater
  });

  it("calls onToggleTheme when theme toggle is clicked", async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();

    renderNavBar({ route: "/", onToggleTheme });
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("when logged in: shows side-nav Sign out and avatar button; avatar click toggles menu + closes nav", async () => {
    const user = userEvent.setup();
    authState = {
      user: { email: "test@example.com", avatar: "🦊" },
      logout: mockLogout,
    };

    const setNavOpen = vi.fn();
    const setUserMenuOpen = vi.fn();

    renderNavBar({ route: "/", navOpen: true, userMenuOpen: false, setNavOpen, setUserMenuOpen });

    // There are TWO sign out buttons only when userMenuOpen === true.
    // Here it's false, so only side-nav signout exists.
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open user menu/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open user menu/i }));
    expect(setNavOpen).toHaveBeenCalledWith(false);
    expect(setUserMenuOpen).toHaveBeenCalled();
  });

  it("logout navigates to /auth and closes menus", async () => {
    const user = userEvent.setup();
    authState = {
      user: { email: "test@example.com", avatar: "🦊" },
      logout: mockLogout.mockResolvedValueOnce(undefined),
    };

    const setNavOpen = vi.fn();
    const setUserMenuOpen = vi.fn();

    renderNavBar({
      route: "/feedback",
      navOpen: true,
      userMenuOpen: true, // this creates a SECOND "Sign out" button in the topbar menu
      setNavOpen,
      setUserMenuOpen,
    });

    // ✅ Scope to the SIDE NAV so we don't collide with the topbar "Sign out"
    const sideNav = document.querySelector("aside.side-nav");
    const side = within(sideNav);
    await user.click(side.getByRole("button", { name: /^sign out$/i }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(setUserMenuOpen).toHaveBeenCalledWith(false);
    expect(setNavOpen).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith("/auth", { replace: true });
  });
});