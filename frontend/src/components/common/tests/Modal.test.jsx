// frontend/src/components/common/tests/Modal.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import Modal from "../Modal.jsx";

describe("components/common/Modal", () => {
  beforeEach(() => {
    // Ensure clean theme baseline
    document.documentElement.dataset.theme = "light";
    if (document.body) document.body.dataset.theme = "";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("returns null when open=false", () => {
    const { container } = render(
      <Modal open={false} title="Hello" onClose={() => {}}>
        Body
      </Modal>
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with title and children when open=true", () => {
    render(
      <Modal open={true} title="My Modal" onClose={() => {}}>
        <div>Modal body</div>
      </Modal>
    );

    const dlg = screen.getByRole("dialog");
    expect(dlg).toBeTruthy();
    expect(screen.getByText("My Modal")).toBeTruthy();
    expect(screen.getByText("Modal body")).toBeTruthy();
    expect(dlg).toHaveAttribute("aria-modal", "true");
  });

  it("calls onClose when clicking backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} title="X" onClose={onClose}>
        Body
      </Modal>
    );

    const backdrop = container.querySelector(".mBackdrop");
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the close button", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} title="X" onClose={onClose}>
        Body
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when pressing Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} title="X" onClose={onClose}>
        Body
      </Modal>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose for non-Escape keys", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} title="X" onClose={onClose}>
        Body
      </Modal>
    );

    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onClose).toHaveBeenCalledTimes(0);
  });

  it("renders footer when provided", () => {
    render(
      <Modal
        open={true}
        title="Has footer"
        onClose={() => {}}
        footer={<div>Footer area</div>}
      >
        Body
      </Modal>
    );

    expect(screen.getByText("Footer area")).toBeTruthy();
  });

  it("does not render footer container when footer is null/absent", () => {
    const { container } = render(
      <Modal open={true} title="No footer" onClose={() => {}}>
        Body
      </Modal>
    );

    expect(container.querySelector(".mFoot")).toBeNull();
  });

  it("applies theme-light by default and reflects data-theme", () => {
    document.documentElement.dataset.theme = "light";

    render(
      <Modal open={true} title="Theme" onClose={() => {}}>
        Body
      </Modal>
    );

    const dlg = screen.getByRole("dialog");
    expect(dlg.className).toContain("theme-light");
    expect(dlg).toHaveAttribute("data-theme", "light");
  });

  it("applies theme-dark when html data-theme=dark", () => {
    document.documentElement.dataset.theme = "dark";

    render(
      <Modal open={true} title="Theme" onClose={() => {}}>
        Body
      </Modal>
    );

    const dlg = screen.getByRole("dialog");
    expect(dlg.className).toContain("theme-dark");
    expect(dlg).toHaveAttribute("data-theme", "dark");
  });

  it("syncs theme when html data-theme changes while open", async () => {
    document.documentElement.dataset.theme = "light";

    render(
      <Modal open={true} title="Theme" onClose={() => {}}>
        Body
      </Modal>
    );

    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveAttribute("data-theme", "light");
    expect(dlg.className).toContain("theme-light");

    // Change theme, then wait a tick for MutationObserver callback to run
    document.documentElement.dataset.theme = "dark";

    await new Promise((r) => setTimeout(r, 0));

    expect(dlg).toHaveAttribute("data-theme", "dark");
    expect(dlg.className).toContain("theme-dark");
  });

  it("cleans up keydown listener on unmount (no extra close calls)", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open={true} title="X" onClose={onClose}>
        Body
      </Modal>
    );

    unmount();

    // If listener wasn't removed, this would still call onClose
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(0);
  });
});