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

  it("returns null when title and body are both empty strings", () => {
    const { container } = render(<ErrorBanner title="" body="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title only when body is not provided", () => {
    const { container } = render(<ErrorBanner title="Something went wrong" />);

    // wrapper exists
    const wrap = container.querySelector(".errorBanner");
    expect(wrap).toBeTruthy();

    // title is strong
    const title = screen.getByText("Something went wrong");
    expect(title.tagName.toLowerCase()).toBe("strong");

    // no body div
    expect(container.querySelector(".errorBanner > div")).toBeNull();
  });

  it("renders body only when title is not provided", () => {
    const { container } = render(<ErrorBanner body="Detailed explanation" />);

    // wrapper exists
    const wrap = container.querySelector(".errorBanner");
    expect(wrap).toBeTruthy();

    // no strong when no title
    expect(container.querySelector(".errorBanner > strong")).toBeNull();

    // body is present
    expect(screen.getByText("Detailed explanation")).toBeInTheDocument();
  });

  it("renders both title and body when provided", () => {
    const { container } = render(<ErrorBanner title="Error" body="More details here" />);

    expect(container.querySelector(".errorBanner")).toBeTruthy();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("More details here")).toBeInTheDocument();
  });

  it("body container uses whiteSpace: pre-line and marginTop: 6", () => {
    const body = "Line one\nLine two";
    const { container } = render(<ErrorBanner body={body} />);

    // the body is rendered inside the errorBanner div as a <div style=...>
    const bodyDiv = container.querySelector(".errorBanner > div");
    expect(bodyDiv).toBeTruthy();

    expect(bodyDiv).toHaveStyle("white-space: pre-line");
    expect(bodyDiv).toHaveStyle("margin-top: 6px");
  });

  it("renders body as a single text node (newline preserved in textContent)", () => {
    const body = "Line one\nLine two";
    render(<ErrorBanner body={body} />);

    const el = screen.getByText((content) => content.includes("Line one") && content.includes("Line two"));
    expect(el.textContent).toContain("Line one");
    expect(el.textContent).toContain("Line two");
  });
});