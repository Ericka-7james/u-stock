// frontend/src/components/dashboard/cards/shared/DashboardCard.jsx
import React from "react";

/**
 * DashboardCard
 * A lightweight shell for dashboard cards with consistent header layout.
 *
 * Keeps your existing classnames flexible via props so you don't have to refactor CSS.
 */
export default function DashboardCard({
  as: As = "section",
  className = "panel",
  headerClassName = "card-header",
  headerLeftClassName = "card-header-left",
  titleTag: TitleTag = "h2",
  titleClassName = "panel-title",
  subtitleClassName = "card-subtitle",
  title,
  subtitle,
  rightActions = null,
  headerExtra = null,
  children,
}) {
  return (
    <As className={className}>
      {(title || subtitle || rightActions || headerExtra) ? (
        <div className={headerClassName}>
          <div className={headerLeftClassName}>
            {title ? <TitleTag className={titleClassName}>{title}</TitleTag> : null}
            {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
            {headerExtra}
          </div>

          {rightActions ? <div className="card-header-right">{rightActions}</div> : null}
        </div>
      ) : null}

      {children}
    </As>
  );
}