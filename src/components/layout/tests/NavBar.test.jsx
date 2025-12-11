// src/components/layout/tests/NavBar.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import NavBar from "../NavBar";
import { AuthProvider } from "../../../context/AuthContext";

// Helper to render NavBar with router + auth provider
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
      <AuthProvider>
        <NavBar
          navOpen={navOpen}
          setNavOpen={setNavOpen}
          userMenuOpen={userMenuOpen}
          setUserMenuOpen={setUserMenuOpen}
          isDark={isDark}
          onToggleTheme={onToggleTheme}
        />
      </AuthProvider>
    </MemoryRouter>
  );

  return {
    ...utils,
    setNavOpen,
    setUserMenuOpen,
    onToggleTheme,
  };
}

describe("NavBar", () => {
  it("renders brand and all primary nav links", () => {
    renderNavBar({ route: "/" });

    expect(screen.getByText("U-Stock")).toBeInTheDocument();
    expect(screen.getByText("Radar Suite")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /data sources/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /index funds/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /about me/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /feedback/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/made by ericka james/i)
    ).toBeInTheDocument();
  });

  it("applies active class to the Dashboard link when on root route", () => {
    const { container } = renderNavBar({ route: "/" });

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink.className).toMatch(/side-nav-item--active/);

    const activeEls = container.querySelectorAll(".side-nav-item--active");
    expect(activeEls.length).toBe(1);
  });

  it("applies active class to Data Sources when on /data-sources route", () => {
    const { container } = renderNavBar({ route: "/data-sources" });

    const dataSourcesLink = screen.getByRole("link", {
      name: /data sources/i,
    });
    expect(dataSourcesLink.className).toMatch(/side-nav-item--active/);

    const activeEls = container.querySelectorAll(".side-nav-item--active");
    expect(activeEls.length).toBe(1);
  });

  it("calls setNavOpen updater when hamburger button is clicked", () => {
    const setNavOpen = vi.fn();

    renderNavBar({ route: "/", setNavOpen });

    const hamburger = screen.getByRole("button", {
      name: /open navigation/i,
    });
    fireEvent.click(hamburger);

    // Uses setNavOpen((open) => !open)
    expect(setNavOpen).toHaveBeenCalledTimes(1);
    expect(typeof setNavOpen.mock.calls[0][0]).toBe("function");
  });

  it("calls onToggleTheme when the dark mode toggle is clicked", () => {
    const onToggleTheme = vi.fn();

    renderNavBar({ route: "/", onToggleTheme });

    const themeToggle = screen.getByRole("button", {
      name: /toggle dark mode/i,
    });
    fireEvent.click(themeToggle);

    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });
});
