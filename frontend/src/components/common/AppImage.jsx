// src/components/common/AppImage.jsx

import React from "react";

/**
 * Shared image wrapper component used across the application.
 *
 * This component standardizes image rendering while allowing optional wrapper
 * markup for layout, styling, and container-level attributes. It is intended
 * to be a lightweight UI primitive that keeps page-level image usage consistent.
 *
 * Supported behaviors:
 * - Render a plain image element when no wrapper is needed.
 * - Render an optional wrapper for layout and presentation concerns.
 * - Forward image-specific props to the underlying rendered image element.
 * - Support custom image element types through the `as` prop.
 *
 * Typical use cases:
 * - Hero images
 * - Brand icons
 * - Logo strips
 * - Clickable decorative or content images
 *
 * @param {Object} props Component props.
 * @param {string} props.src Image source URL or imported asset.
 * @param {string} [props.alt=""] Accessible alternative text.
 * @param {string} [props.className=""] Class name applied to the image element.
 * @param {string} [props.wrapperClassName=""] Class name applied to the wrapper element.
 * @param {React.CSSProperties} [props.wrapperStyle] Inline styles applied to the wrapper element.
 * @param {React.CSSProperties} [props.imgStyle] Inline styles applied to the image element.
 * @param {"lazy"|"eager"} [props.loading="lazy"] Native image loading behavior.
 * @param {"sync"|"async"|"auto"} [props.decoding="async"] Native image decoding hint.
 * @param {boolean} [props.ariaHidden=false] Whether the image should be hidden from assistive technology.
 * @param {boolean} [props.draggable=false] Whether the image is draggable.
 * @param {Function} [props.onClick] Click handler for the image element.
 * @param {Function} [props.onLoad] Load handler for the image element.
 * @param {Function} [props.onError] Error handler for the image element.
 * @param {string|React.ElementType} [props.as="img"] Element or component used to render the image.
 * @param {Object} [props.wrapperProps] Additional props spread onto the wrapper element.
 * @param {Object} [props.rest] Additional props spread onto the rendered image element.
 * @return {JSX.Element} Rendered image or wrapped image element.
 */
export default function AppImage({
  src,
  alt = "",
  className = "",
  wrapperClassName = "",
  wrapperStyle,
  imgStyle,
  loading = "lazy",
  decoding = "async",
  ariaHidden = false,
  draggable = false,
  onClick,
  onLoad,
  onError,
  as = "img",
  wrapperProps = {},
  ...rest
}) {
  const ImageTag = as;

  const imageElement = (
    <ImageTag
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

  const shouldWrap = Boolean(wrapperClassName || wrapperStyle || Object.keys(wrapperProps).length);

  if (!shouldWrap) {
    return imageElement;
  }

  return (
    <div className={wrapperClassName} style={wrapperStyle} {...wrapperProps}>
      {imageElement}
    </div>
  );
}