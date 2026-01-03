import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

// Mock AuthContext so NavBar/AppShell don't throw
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
  function renderAbout() {
    return render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
  }

  it("renders the hero heading and headshot avatar", () => {
    renderAbout();

    expect(
      screen.getByRole("heading", { name: /about the author/i })
    ).toBeInTheDocument();

    const img = screen.getByAltText(/ericka james headshot/i);
    expect(img).toBeInTheDocument();
    // optional but nice: confirms you’re using the new headshot styling
    expect(img).toHaveClass("about-avatar-image");
  });

  it('renders the "Back to dashboard" internal link', () => {
    renderAbout();

    const backLink = screen.getByRole("link", { name: /back to dashboard/i });
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("renders GitHub and LinkedIn links with correct hrefs", () => {
    renderAbout();

    const githubLink = screen.getByRole("link", {
      name: /github → ericka-7james/i,
    });
    expect(githubLink).toHaveAttribute("href", "https://github.com/ericka-7james");

    const linkedinLink = screen.getByRole("link", {
      name: /linkedin → erickasmileyjames/i,
    });
    expect(linkedinLink).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/erickasmileyjames"
    );
  });
});
