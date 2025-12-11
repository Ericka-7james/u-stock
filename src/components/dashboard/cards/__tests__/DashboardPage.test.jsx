// src/components/dashboard/cards/__tests__/DashboardPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "../../DashboardPage";

// ---- Mock AuthContext so AppShell/NavBar can call useAuth safely ----
vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "test@example.com", avatar: "📈" },
    login: vi.fn(),
    logout: vi.fn(),
    signup: vi.fn(),
  }),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    // if you later add spies/mocks, reset here
  });

  it("renders without crashing inside a router", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <DashboardPage />
      </MemoryRouter>
    );

    // Assert something simple on the dashboard so the test has a real check.
    // Adjust this text to whatever is definitely on your dashboard page.
    expect(
      screen.getByText(/dashboard/i)
    ).toBeInTheDocument();
  });
});
