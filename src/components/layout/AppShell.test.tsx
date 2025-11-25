// src/components/layout/AppShell.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("renders children content", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>hello shell</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getByText("hello shell")).toBeInTheDocument();
  });
});
