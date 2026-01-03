import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect } from "vitest";
import FullPageLoader from "../FullPageLoader";

describe("FullPageLoader", () => {
  test("renders with default label", () => {
    render(<FullPageLoader />);

    // role + aria-label default
    const status = screen.getByRole("status", { name: /loading…/i });
    expect(status).toBeInTheDocument();

    // visible text
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
  });

  test("renders with a custom label", () => {
    render(<FullPageLoader label="Fetching signals…" />);

    const status = screen.getByRole("status", { name: /fetching signals…/i });
    expect(status).toBeInTheDocument();

    expect(screen.getByText(/fetching signals…/i)).toBeInTheDocument();
  });

  test("is announced politely for assistive tech", () => {
    render(<FullPageLoader label="Please wait…" />);

    const status = screen.getByRole("status", { name: /please wait…/i });
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
