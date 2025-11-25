// src/components/dashboard/DashboardPage.test.jsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";

describe("DashboardPage", () => {
  it("renders without crashing inside a router", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
  });
});
