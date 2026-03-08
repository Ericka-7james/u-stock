// src/components/common/PillButton.jsx
import React from "react";

/**
 * Reusable pill-style button / link.
 *
 * Variants:
 * - accent: green tinted pill
 * - ghost: transparent / subtle
 * - solid: filled green
 *
 * Sizes:
 * - sm
 * - md
 *
 * Usage:
 * <PillButton onClick={...}>See roadmap</PillButton>
 * <PillButton variant="ghost">Learn more</PillButton>
 * <PillButton as="a" href="/about">About</PillButton>
 */
export default function PillButton({
  as = "button",
  type = "button",
  variant = "accent",
  size = "md",
  className = "",
  children,
  disabled = false,
  ...rest
}) {
  const Component = as;

  const classes = [
    "pill-btn",
    `pill-btn--${variant}`,
    `pill-btn--${size}`,
    disabled ? "pill-btn--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (Component === "button") {
    return (
      <button type={type} className={classes} disabled={disabled} {...rest}>
        {children}
      </button>
    );
  }

  return (
    <Component className={classes} aria-disabled={disabled ? "true" : undefined} {...rest}>
      {children}
    </Component>
  );
}