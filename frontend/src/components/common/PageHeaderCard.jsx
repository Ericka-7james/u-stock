import React from "react";
import "../../css/common/PageHeaderCard.css";

/**
 * Reusable page header card (same “hero card” language across pages).
 *
 * Props:
 * - title: string
 * - subtitle: string | ReactNode
 * - children: left body content
 * - right: ReactNode (optional) -> hidden on small screens like Landing
 */
export default function PageHeaderCard({ title, subtitle, children, right }) {
  return (
    <div className="page-header-wrap">
      <section className="page-header-card">
        <div className="page-header-left">
          <h1 className="page-header-title">{title}</h1>
          {subtitle ? <div className="page-header-subtitle">{subtitle}</div> : null}
          <div className="page-header-body">{children}</div>
        </div>

        {right ? (
          <div className="page-header-right" aria-label="Page header media">
            <div className="page-header-rightInner">{right}</div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
