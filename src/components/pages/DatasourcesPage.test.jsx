// src/components/pages/DatasourcesPage.test.jsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DatasourcesPage from "./DatasourcesPage";

describe("DatasourcesPage", () => {
  it("renders without crashing", () => {
    render(
      <MemoryRouter>
        <DatasourcesPage />
      </MemoryRouter>
    );
  });
});
