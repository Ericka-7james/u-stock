// frontend/src/components/common/tests/ErrorBanner.test.jsx
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import ErrorBanner from "../ErrorBanner.jsx";

describe("ErrorBanner", () => {
  afterEach(() => cleanup());

  it("returns null when no title and no body are provided", () => {
    const { container } = render(<ErrorBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title only when body is not provided", () => {
    render(<ErrorBanner title="Something went wrong" />);
    const title = screen.getByText("Something went wrong");
    expect(title.tagName.toLowerCase()).toBe("strong");
  });

  it("renders body only when title is not provided", () => {
    render(<ErrorBanner body="Detailed explanation" />);
    expect(screen.getByText("Detailed explanation")).toBeInTheDocument();
  });

  it("renders both title and body when provided", () => {
    render(<ErrorBanner title="Error" body="More details here" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("More details here")).toBeInTheDocument();
  });

  it("body container uses whiteSpace: pre-line (newline-friendly)", () => {
    const body = "Line one\nLine two";
    const { container } = render(<ErrorBanner body={body} />);

    // the body is rendered inside the errorBanner div as a <div style=...>
    const bodyDiv = container.querySelector(".errorBanner > div");
    expect(bodyDiv).toBeTruthy();
    expect(bodyDiv).toHaveStyle({ whiteSpace: "pre-line" });
  });
});