import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect } from "vitest";
import HelpTooltip from "../HelpTooltip";

describe("HelpTooltip", () => {
  test("renders help icon button", () => {
    render(<HelpTooltip title="Test Help">Help content</HelpTooltip>);
    const button = screen.getByRole("button", { name: /test help/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("?");
  });

  test("opens popover when help button is clicked", () => {
    render(<HelpTooltip title="Test Help">Help content</HelpTooltip>);
    fireEvent.click(screen.getByRole("button", { name: /test help/i }));
    expect(screen.getByRole("dialog", { name: /test help/i })).toBeInTheDocument();
    expect(screen.getByText("Help content")).toBeInTheDocument();
  });

  test("closes popover when close button is clicked", () => {
    render(<HelpTooltip title="Test Help">Help content</HelpTooltip>);
    fireEvent.click(screen.getByRole("button", { name: /test help/i }));
    fireEvent.click(screen.getByRole("button", { name: /close help/i }));
    expect(screen.queryByText("Help content")).not.toBeInTheDocument();
  });

  test("closes popover when backdrop is clicked", () => {
    render(<HelpTooltip title="Test Help">Help content</HelpTooltip>);
    fireEvent.click(screen.getByRole("button", { name: /test help/i }));

    const backdrop = document.querySelector(".help-popover-backdrop");
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop);
    expect(screen.queryByText("Help content")).not.toBeInTheDocument();
  });

  test("Escape key closes popover", () => {
    render(<HelpTooltip title="Test Help">Help content</HelpTooltip>);
    fireEvent.click(screen.getByRole("button", { name: /test help/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Help content")).not.toBeInTheDocument();
  });
});
