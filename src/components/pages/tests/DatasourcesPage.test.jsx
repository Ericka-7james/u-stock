// src/components/pages/tests/DatasourcesPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

// Mock AuthContext so NavBar/AppShell can call useAuth safely
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

import DatasourcesPage from "../DatasourcesPage";

describe("DatasourcesPage", () => {
  it("renders without crashing", () => {
    render(
      <MemoryRouter>
        <DatasourcesPage />
      </MemoryRouter>
    );

    // More specific: grab the page title <h1>
    expect(
      screen.getByRole("heading", { name: /data sources & quant pipeline/i })
    ).toBeInTheDocument();
  });
});
