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
  it("renders brand and primary nav links (logged out)", () => {
    renderNavBar({ route: "/" });

    // Brand changed
    expect(screen.getByText(/lucent financial/i)).toBeInTheDocument();
    expect(screen.getByText(/financial intelligence/i)).toBeInTheDocument();

    // Primary nav labels changed
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /market & logs/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /market baselines/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /connected brokers/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /feedback/i })).toBeInTheDocument();

    // Footer credit exists
    expect(screen.getByText(/made by ericka james/i)).toBeInTheDocument();
  });

  it("applies active class to Market & Logs when on /data-sources", () => {
    renderNavBar({ route: "/data-sources" });

    const link = screen.getByRole("link", { name: /market & logs/i });
    expect(link.className).toMatch(/side-nav-item--active/);
  });

  it("applies active class to Connected Brokers when on /connected-apps", () => {
    renderNavBar({ route: "/connected-apps" });

    const link = screen.getByRole("link", { name: /connected brokers/i });
    expect(link.className).toMatch(/side-nav-item--active/);
  });
});
