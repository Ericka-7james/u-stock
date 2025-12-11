// src/components/layout/AppShell.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppShell from "../AppShell";
import { AuthProvider } from "../../../context/AuthContext";

// small helper so we don't repeat wrappers
function renderWithProviders(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  it("renders children content", () => {
    renderWithProviders(
      <AppShell>
        <div>hello shell</div>
      </AppShell>
    );

    expect(screen.getByText("hello shell")).toBeInTheDocument();
  });

  it("toggles side nav open/closed via the hamburger button", () => {
    const { container } = renderWithProviders(
      <AppShell>
        <div>content</div>
      </AppShell>
    );

    const shell = container.firstElementChild as HTMLElement;
    const hamburger = screen.getByRole("button", { name: /open navigation/i });

    // nav closed by default
    expect(shell.className).not.toContain("app-shell--nav-open");

    // click hamburger -> nav opens
    fireEvent.click(hamburger);
    expect(shell.className).toContain("app-shell--nav-open");

    // click hamburger again -> nav closes
    fireEvent.click(hamburger);
    expect(shell.className).not.toContain("app-shell--nav-open");
  });

  it("closes the side nav when clicking in the main app area", () => {
    const { container } = renderWithProviders(
      <AppShell>
        <div>main body</div>
      </AppShell>
    );

    const shell = container.firstElementChild as HTMLElement;
    const hamburger = screen.getByRole("button", { name: /open navigation/i });

    // Open the nav first
    fireEvent.click(hamburger);
    expect(shell.className).toContain("app-shell--nav-open");

    // Click anywhere in the main area (app-main)
    const appMain = container.querySelector(".app-main") as HTMLElement;
    fireEvent.click(appMain);

    // Nav should be closed again
    expect(shell.className).not.toContain("app-shell--nav-open");
  });
});
