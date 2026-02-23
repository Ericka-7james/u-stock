// frontend/src/components/dashboard/cards/shared/ConnectedBrokersMiniCard.jsx
import { Link } from "react-router-dom";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function ConnectedBrokersMiniCard({
  to = "/connected-apps",
  title = "Connected brokers",
  subtitle = "Manage Alpaca/Polygon keys and integrations →",
  className = "connected-mini-card",
  ariaLabel = "Go to Connected Brokers",
}) {
  return (
    <Link to={to} className={cx("connected-mini-card", className)} aria-label={ariaLabel}>
      <div className="connected-mini-title">{title}</div>
      {subtitle ? <div className="connected-mini-sub">{subtitle}</div> : null}
    </Link>
  );
}