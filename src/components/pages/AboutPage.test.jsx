// src/components/pages/AboutPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AboutPage from "./AboutPage";

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
