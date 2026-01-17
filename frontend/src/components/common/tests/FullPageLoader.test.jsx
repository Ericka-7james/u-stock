import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ✅ Mock the image imports so src is guaranteed to change
vi.mock("../../../assets/loading/LoadingScreen1.png", () => ({
  default: "frame-1.png",
}));
vi.mock("../../../assets/loading/LoadingScreen2.png", () => ({
  default: "frame-2.png",
}));
vi.mock("../../../assets/loading/LoadingScreen3.png", () => ({
  default: "frame-3.png",
}));

import FullPageLoader from "../FullPageLoader";

describe("FullPageLoader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders with default label", () => {
    render(<FullPageLoader />);

    const status = screen.getByRole("status", { name: /loading…/i });
    expect(status).toBeInTheDocument();
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
  });

  test("renders with a custom label", () => {
    render(<FullPageLoader label="Fetching signals…" />);

    const status = screen.getByRole("status", { name: /fetching signals…/i });
    expect(status).toBeInTheDocument();
    expect(screen.getByText(/fetching signals…/i)).toBeInTheDocument();
  });

  test("cycles frames over time", () => {
    render(<FullPageLoader label="Loading…" />);

    const img = screen.getByTestId("fpl-frame");
    const src1 = img.getAttribute("src");

    act(() => {
      vi.advanceTimersByTime(130);
    });

    const src2 = img.getAttribute("src");
    expect(src2).not.toBe(src1);
  });
});
