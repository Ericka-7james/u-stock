// src/components/layout/AppShell.jsx
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
// Reuse the existing shell + dashboard styles
import "../dashboard/DashboardPage.css";

export default function AppShell({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  const isDashboard = location.pathname === "/";
  const isDatasources = location.pathname.startsWith("/datasources");
  const isIndexFunds = location.pathname.startsWith("/index-funds");
  const isAboutMe = location.pathname.startsWith("/about");

  return (
    <div className={`app-shell ${navOpen ? "app-shell--nav-open" : ""}`}>
      {/* Side nav (U-Stock brand) */}
      <aside className="side-nav">
        <div className="side-nav-brand">
          <div className="side-nav-logo-circle">U</div>
          <div className="side-nav-brand-text">
            <span className="side-nav-name">U-Stock</span>
            <span className="side-nav-tagline">Radar Suite</span>
          </div>
        </div>

        <nav className="side-nav-menu">
          <Link
            to="/"
            className={
              "side-nav-item " + (isDashboard ? "side-nav-item--active" : "")
            }
          >
            <span className="side-nav-item-dot" />
            Dashboard
          </Link>

          <Link
            to="/datasources"
            className={
              "side-nav-item " + (isDatasources ? "side-nav-item--active" : "")
            }
          >
            <span className="side-nav-item-dot" />
            Data Sources
          </Link>

          <Link
            to="/index-funds"
            className={
              "side-nav-item " + (isIndexFunds ? "side-nav-item--active" : "")
            }
          >
            <span className="side-nav-item-dot" />
            Index Funds
          </Link>

          <Link
            to="/about"
            className={
              "side-nav-item " + (isAboutMe ? "side-nav-item--active" : "")
            }
          >
            <span className="side-nav-item-dot" />
            About me
          </Link>

          <button className="side-nav-item" type="button">
            <span className="side-nav-item-dot" />
            Settings
          </button>
        </nav>

        <div className="side-nav-footer">
            <span className="side-nav-footer-name">Made by Ericka James</span>
            <span className="side-nav-footer-email">james7.ericka@gmail.com</span>
        </div>

      </aside>

      {/* Main side: topbar + page content + footer */}
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="hamburger-btn"
              type="button"
              aria-label="Open navigation"
              onClick={() => setNavOpen((open) => !open)}
            >
              <span className="hamburger-lines" />
            </button>

            <Link to="/" className="topbar-home-link" onClick={() => setNavOpen(false)}>
              <span className="topbar-home-label">Home</span>
            </Link>
          </div>

          <div className="topbar-right">
            <button className="icon-btn">
              <span className="icon-search" />
            </button>
            <button className="icon-btn">
              <span className="icon-bell" />
            </button>
          </div>
        </header>

        <div className="app-content">
          {children}
        </div>

        <footer className="site-footer global-footer">
          © 2025 U-Stock. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
