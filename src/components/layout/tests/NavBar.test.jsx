import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
    mockLogout.mockReset();
    authState = { user: null, logout: mockLogout };
  });

  it("renders brand and primary nav links (logged out)", () => {
    renderNavBar({ route: "/" });

    expect(screen.getByText("U-Stock")).toBeInTheDocument();
    expect(screen.getByText("Radar Suite")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /data sources/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /index funds/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /about me/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /feedback/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /connected apps/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/made by ericka james/i)).toBeInTheDocument();

    // Sign out should NOT appear logged out
    expect(
      screen.queryByRole("button", { name: /sign out/i })
    ).not.toBeInTheDocument();
  });

  it("applies active class to Dashboard when on /", () => {
    const { container } = renderNavBar({ route: "/" });

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink.className).toMatch(/side-nav-item--active/);

    const activeEls = container.querySelectorAll(".side-nav-item--active");
    expect(activeEls.length).toBe(1);
  });

  it("applies active class to Data Sources when on /data-sources", () => {
    const { container } = renderNavBar({ route: "/data-sources" });

    const link = screen.getByRole("link", { name: /data sources/i });
    expect(link.className).toMatch(/side-nav-item--active/);

    const activeEls = container.querySelectorAll(".side-nav-item--active");
    expect(activeEls.length).toBe(1);
  });

  it("applies active class to Connected Apps when on /connected-apps", () => {
    const { container } = renderNavBar({ route: "/connected-apps" });

    const link = screen.getByRole("link", { name: /connected apps/i });
    expect(link.className).toMatch(/side-nav-item--active/);

    const activeEls = container.querySelectorAll(".side-nav-item--active");
    expect(activeEls.length).toBe(1);
  });

  it("calls setNavOpen updater when hamburger is clicked", () => {
    const setNavOpen = vi.fn();
    renderNavBar({ setNavOpen });

    const hamburger = screen.getByRole("button", { name: /open navigation/i });
    fireEvent.click(hamburger);

    expect(setNavOpen).toHaveBeenCalledTimes(1);
    expect(typeof setNavOpen.mock.calls[0][0]).toBe("function");
  });

  it("calls onToggleTheme when dark mode toggle is clicked", () => {
    const onToggleTheme = vi.fn();
    renderNavBar({ onToggleTheme });

    const themeToggle = screen.getByRole("button", { name: /toggle dark mode/i });
    fireEvent.click(themeToggle);

    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("shows user avatar + user menu when logged in, and calls logout (TOPBAR menu)", () => {
    authState = {
      user: { email: "test@example.com", avatar: "📈" },
      logout: mockLogout,
    };

    const setUserMenuOpen = vi.fn();
    const setNavOpen = vi.fn();

    const { container } = renderNavBar({
      route: "/",
      userMenuOpen: true, // force menu open so we can test dropdown sign out
      setUserMenuOpen,
      setNavOpen,
    });

    // avatar button exists
    expect(
      screen.getByRole("button", { name: /open user menu/i })
    ).toBeInTheDocument();

    // menu email visible
    expect(screen.getByText("test@example.com")).toBeInTheDocument();

    // ✅ Scope sign out click to the TOPBAR dropdown to avoid the side-nav sign out
    const menu = container.querySelector(".topbar-user-menu");
    expect(menu).toBeTruthy();

    const signOutInMenu = within(menu).getByRole("button", {
      name: /^sign out$/i,
    });

    fireEvent.click(signOutInMenu);

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(setUserMenuOpen).toHaveBeenCalledWith(false);
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });

  it("renders side nav Sign out button when logged in and triggers logout", () => {
    authState = {
      user: { email: "test@example.com", avatar: "👤" },
      logout: mockLogout,
    };

    const setUserMenuOpen = vi.fn();
    const setNavOpen = vi.fn();

    const { container } = renderNavBar({ setUserMenuOpen, setNavOpen });

    // ✅ Scope to side-nav so we don’t accidentally hit topbar menu if it’s open later
    const sideNav = container.querySelector(".side-nav");
    expect(sideNav).toBeTruthy();

    const sideSignOut = within(sideNav).getByRole("button", {
      name: /^sign out$/i,
    });

    fireEvent.click(sideSignOut);

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(setUserMenuOpen).toHaveBeenCalledWith(false);
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });
});
