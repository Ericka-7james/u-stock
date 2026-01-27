// src/components/layout/tests/AppShell.test.jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

import AppShell from "../AppShell";

// ✅ Mock NavBar so AppShell tests don't depend on AuthProvider or NavBar internals
vi.mock("../NavBar", () => ({
  default: function MockNavBar(props) {
    return (
      <div data-testid="mock-navbar">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.setNavOpen((open) => !open);
          }}
        >
          toggle-nav
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.setUserMenuOpen((open) => !open);
          }}
        >
          toggle-user
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleTheme();
          }}
        >
          toggle-theme
        </button>
      </div>
    );
  },
}));

function renderShell(ui) {
  return render(
    <MemoryRouter>
      <AppShell>{ui}</AppShell>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    // keep tests isolated
    document.body.className = "";
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("renders children content", () => {
    renderShell(<div>hello shell</div>);
    expect(screen.getByText("hello shell")).toBeInTheDocument();
  });

  it("writes theme to DOM + localStorage on mount (default light)", () => {
    renderShell(<div>content</div>);

    expect(document.body.classList.contains("ustock-dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("ustock-theme")).toBe("light");
  });

  it("hydrates theme from localStorage (dark) and updates DOM", () => {
    window.localStorage.setItem("ustock-theme", "dark");

    renderShell(<div>content</div>);

    expect(document.body.classList.contains("ustock-dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles theme when NavBar triggers onToggleTheme", () => {
    renderShell(<div>content</div>);

    // initial light
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: /toggle-theme/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: /toggle-theme/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("adds/removes app-shell--nav-open class when navOpen changes", () => {
    const { container } = renderShell(<div>content</div>);
    const shell = container.querySelector(".app-shell");
    expect(shell).toBeTruthy();

    // closed initially
    expect(shell.className).not.toContain("app-shell--nav-open");

    // open
    fireEvent.click(screen.getByRole("button", { name: /toggle-nav/i }));
    expect(shell.className).toContain("app-shell--nav-open");

    // close
    fireEvent.click(screen.getByRole("button", { name: /toggle-nav/i }));
    expect(shell.className).not.toContain("app-shell--nav-open");
  });

  it("global click closes nav + user menu if they are open", () => {
    const { container } = renderShell(<div>content</div>);
    const shell = container.querySelector(".app-shell");
    expect(shell).toBeTruthy();

    // open both via mocked navbar buttons
    fireEvent.click(screen.getByRole("button", { name: /toggle-nav/i }));
    fireEvent.click(screen.getByRole("button", { name: /toggle-user/i }));
    expect(shell.className).toContain("app-shell--nav-open");

    // click anywhere on shell => should close both
    fireEvent.click(shell);

    // nav class removed
    expect(shell.className).not.toContain("app-shell--nav-open");
  });

  it("renders footer", () => {
    renderShell(<div>content</div>);

    // ✅ Matches new footer:
    // © 2025 –2026 Lucent Financial. All rights reserved.
    // (React may insert whitespace/newlines, so allow flexible spacing.)
    expect(
      screen.getByText(
        /©\s*2025\s*–\s*2026\s*lucent financial\.\s*all rights reserved\./i
      )
    ).toBeInTheDocument();
  });
});
