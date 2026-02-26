// frontend/src/components/common/tests/ErrorModal.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import ErrorModal from "../ErrorModal.jsx";

function renderModal(props = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onAction = props.onAction ?? vi.fn();

  const defaultProps = {
    open: true,
    error: { title: "T", body: "B", subtitle: "S", image: null, action: null },
    onClose,
    onAction,
  };

  return {
    onClose,
    onAction,
    ...render(<ErrorModal {...defaultProps} {...props} />),
  };
}

describe("ErrorModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when open=false", () => {
    render(<ErrorModal open={false} error={{ title: "X" }} onClose={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns null when error is null even if open=true", () => {
    render(<ErrorModal open error={null} onClose={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders default fallbacks for missing title/body/subtitle", () => {
    renderModal({ error: {} });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Uh oh!")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();

    // subtitle fallback is empty string => subtitle paragraph should not render
    expect(document.querySelector(".ustock-em-sub")).toBeNull();
  });

  it("uses body fallback when body is empty string; does not render subtitle when empty", () => {
    renderModal({ error: { title: "Hello", body: "", subtitle: "" } });

    expect(screen.getByText("Hello")).toBeInTheDocument();

    // body "" is falsy => component falls back to default body text
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();

    // subtitle "" => should not render subtitle paragraph
    expect(document.querySelector(".ustock-em-sub")).toBeNull();
  });

  it("renders hero image when image is provided (decorative image => role=presentation)", () => {
    renderModal({
      error: { title: "T", body: "B", subtitle: "", image: "/x.png", action: null },
    });

    const img = screen.getByRole("presentation");
    expect(img).toHaveAttribute("src", "/x.png");
    expect(img).toHaveClass("ustock-em-heroImg");
  });

  it("does not render hero image when image is null", () => {
    renderModal({
      error: { title: "T", body: "B", subtitle: "", image: null, action: null },
    });

    expect(document.querySelector(".ustock-em-heroImg")).toBeNull();
  });

  it("calls onClose when clicking the overlay", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when clicking inside the modal (stops propagation)", () => {
    const { onClose } = renderModal();

    const modal = document.querySelector(".ustock-em-modal");
    expect(modal).toBeTruthy();

    fireEvent.click(modal);
    expect(onClose).toHaveBeenCalledTimes(0);
  });

  it("calls onClose when pressing Escape while open", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on Escape when open=false", () => {
    const onClose = vi.fn();
    render(<ErrorModal open={false} error={{ title: "X" }} onClose={onClose} onAction={vi.fn()} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(0);
  });

  it("renders the secondary Close button; and no primary button when action is missing", () => {
    renderModal({
      error: { title: "T", body: "B", subtitle: "", image: null, action: null },
    });

    // Scope to the actions area so we don't collide with the icon close button
    const actions = document.querySelector(".ustock-em-actions");
    expect(actions).toBeTruthy();

    expect(within(actions).getByRole("button", { name: /^Close$/ })).toBeInTheDocument();
    expect(document.querySelector(".ustock-em-btn--primary")).toBeNull();
  });

  it("renders the primary action button when action.label is present and calls onAction with the action object", () => {
    const { onAction } = renderModal({
      error: {
        title: "T",
        body: "B",
        subtitle: "",
        image: null,
        action: { label: "Go fix it", href: "/docs" },
      },
    });

    const btn = screen.getByRole("button", { name: "Go fix it" });
    fireEvent.click(btn);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ label: "Go fix it", href: "/docs" });
  });

  it("treats action without label as no-action (does not render primary button)", () => {
    renderModal({
      error: {
        title: "T",
        body: "B",
        subtitle: "",
        image: null,
        action: { href: "/docs" }, // no label
      },
    });

    expect(document.querySelector(".ustock-em-btn--primary")).toBeNull();
  });

  it("close icon button calls onClose (aria-label Close)", () => {
    const { onClose } = renderModal();

    const icon = screen.getByLabelText("Close");
    fireEvent.click(icon);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("removes keydown listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const onClose = vi.fn();
    const { unmount } = render(
      <ErrorModal open error={{ title: "X" }} onClose={onClose} onAction={vi.fn()} />
    );

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});