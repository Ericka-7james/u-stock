// src/components/layout/AppShell.jsx
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./AppShell.css";

export default function AppShell({ children }) {
  const [navOpen, setNavOpen] = useState(false);

  // ✅ define dark-mode state
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("ustock-theme");
    return stored === "dark";
  });

  const location = useLocation();

  const isDashboard = location.pathname === "/";
  const isDatasources = location.pathname.startsWith("/datasources");
  const isIndexFunds = location.pathname.startsWith("/index-funds");
  const isAboutMe = location.pathname.startsWith("/about");
  const isFeedback = location.pathname.startsWith("/fedback");

  const closeNav = () => setNavOpen(false);

  // ✅ define toggleTheme BEFORE you use it in JSX
  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  // ✅ sync the body class when dark mode changes
  useEffect(() => {
    const dark = isDark;
    document.body.classList.toggle("ustock-dark", dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    window.localStorage.setItem("ustock-theme", dark ? "dark" : "light");
  }, [isDark]);

  // Any click in the main content area should close nav (nice for mobile)
  const handleMainClick = () => {
    if (navOpen) {
      closeNav();
    }
  };

  // Stop clicks on the hamburger from bubbling up to app-main
  const handleHamburgerClick = (event) => {
    event.stopPropagation();
    setNavOpen((open) => !open);
  };

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
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Dashboard
          </Link>

          <Link
            to="/data-sources"
            className={
              "side-nav-item " + (isDatasources ? "side-nav-item--active" : "")
            }
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Data Sources
          </Link>

          <Link
            to="/index-funds"
            className={
              "side-nav-item " +
              (isIndexFunds ? "side-nav-item--active" : "")
            }
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Index Funds
          </Link>

          <Link
            to="/about"
            className={
              "side-nav-item " + (isAboutMe ? "side-nav-item--active" : "")
            }
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            About me
          </Link>

          <Link
            to="/feedback"
            className={
              "side-nav-item " + (isFeedback ? "side-nav-item--active" : "")
            }
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Feedback
          </Link>
        </nav>

        <div className="side-nav-footer">
          <span className="side-nav-footer-name">Made by Ericka James</span>
          <span className="side-nav-footer-email">
            james7.ericka@gmail.com
          </span>
        </div>
      </aside>

      {/* Main side: topbar + page content + footer */}
      <div className="app-main" onClick={handleMainClick}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="hamburger-btn"
              type="button"
              aria-label="Open navigation"
              onClick={handleHamburgerClick}
            >
              <span className="hamburger-lines" />
            </button>

            <Link to="/" className="topbar-home-link" onClick={closeNav}>
              <span className="topbar-home-label">Home</span>
            </Link>
          </div>

          <div className="topbar-right">
            {/* ✅ dark mode toggle uses isDark + toggleTheme */}
            <button
              type="button"
              className={`theme-toggle ${isDark ? "theme-toggle--on" : ""}`}
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
            >
              <span className="theme-toggle-thumb" />
              <span className="theme-toggle-moon">☾</span>
            </button>

            <button className="icon-btn">
              <span className="icon-search" />
            </button>
            <button className="icon-btn">
              <span className="icon-bell" />
            </button>
          </div>
        </header>

        <div className="app-content">
          <main className="app-page">{children}</main>
        </div>

        <footer className="site-footer global-footer">
          © 2025 U-Stock. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
