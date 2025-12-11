// src/components/pages/tests/AboutPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

// 👇 Mock AuthContext so NavBar/AppShell don't throw
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

import AboutPage from "../AboutPage";

describe("AboutPage", () => {
  it("renders the hero heading and headshot avatar", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );

    // Hero heading
    expect(
      screen.getByRole("heading", { name: /about the author/i })
    ).toBeInTheDocument();

    // Headshot image
    expect(
      screen.getByAltText(/ericka james headshot/i)
    ).toBeInTheDocument();
  });

  it("renders GitHub and LinkedIn links with correct hrefs", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );

    const githubLink = screen.getByRole("link", {
      name: /github → ericka-7james/i,
    });
    expect(githubLink).toHaveAttribute(
      "href",
      "https://github.com/ericka-7james"
    );

    const linkedinLink = screen.getByRole("link", {
      name: /linkedin → erickasmileyjames/i,
    });
    expect(linkedinLink).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/erickasmileyjames"
    );
  });
});
