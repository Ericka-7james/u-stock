// src/components/common/AppImage.jsx
import React from "react";

/**
 * Reusable image wrapper.
 *
 * Use when you want one common image component across the app
 * without changing page-specific layout/styling.
 *
 * Examples:
 *
 * <AppImage
 *   src={heroImageSrc}
 *   alt="Ericka James headshot"
 *   className="landing-hero-img landing-hero-img--portfolio"
 *   loading="eager"
 * />
 *
 * <AppImage
 *   src={welcomeSquirrel}
 *   alt=""
 *   ariaHidden
 *   className="landing-brandicon"
 * />
 *
 * <AppImage
 *   src={logo.src}
 *   alt={logo.alt}
 *   wrapperClassName="landing-logo-slot"
 *   className="landing-trusted-logo"
 *   wrapperStyle={{ "--z": logo.zoom, "--y": `${logo.y || 0}px` }}
 * />
 */
export default function AppImage({
  src,
  alt = "",
  className = "",
  wrapperClassName = "",
  style,
  imgStyle,
  loading = "lazy",
  decoding = "async",
  ariaHidden = false,
  draggable = false,
  onClick,
  onLoad,
  onError,
  as = "img",
  ...rest
}) {
  const Component = as;

  const imageEl = (
    <Component
      src={src}
      alt={alt}
      className={className}
      style={imgStyle}
      loading={loading}
      decoding={decoding}
      aria-hidden={ariaHidden ? "true" : undefined}
      draggable={draggable}
      onClick={onClick}
      onLoad={onLoad}
      onError={onError}
      {...rest}
    />
  );

  if (!wrapperClassName && !style) {
    return imageEl;
  }

  return (
    <div className={wrapperClassName} style={style}>
      {imageEl}
    </div>
  );
}