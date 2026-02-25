// frontend/src/components/dashboard/cards/shared/DashboardCard.jsx
import React from "react";

export default function DashboardCard(props) {
  const {
    as = "section",
    className = "panel",
    headerClassName = "card-header",
    headerLeftClassName = "card-header-left",
    titleTag = "h2",
    titleClassName = "panel-title",
    subtitleClassName = "card-subtitle",
    title,
    subtitle,
    rightActions = null,
    headerExtra = null,
    children,
  } = props;

  const As = as;
  const TitleTag = titleTag;

  return (
    <As className={className}>
      {title || subtitle || rightActions || headerExtra ? (
        <div className={headerClassName}>
          <div className={headerLeftClassName}>
            {title ? <TitleTag className={titleClassName}>{title}</TitleTag> : null}
            {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
            {headerExtra}
          </div>

          {rightActions ? (
            <div className="card-header-right">{rightActions}</div>
          ) : null}
        </div>
      ) : null}

      {children}
    </As>
  );
}