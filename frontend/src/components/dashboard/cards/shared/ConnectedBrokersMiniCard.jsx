// frontend/src/components/dashboard/cards/shared/ConnectedBrokersMiniCard.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function ConnectedBrokersMiniCard({
  to = "/connected-apps",
  title = "Connected brokers",
  subtitle = "Manage Alpaca/Polygon keys and integrations →",
  className = "connected-mini-card",
  ariaLabel = "Go to Connected Brokers",
}) {
  return (
    <Link to={to} className={className} aria-label={ariaLabel}>
      <div className="connected-mini-title">{title}</div>
      <div className="connected-mini-sub">{subtitle}</div>
    </Link>
  );
}