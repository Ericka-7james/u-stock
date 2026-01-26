// src/components/layout/NavBar.jsx
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../css/layout/NavBar.css";

import dapperSquirrel from "../../assets/images/DapperSquirrel.png";
import navBarLogo from "../../assets/images/NavBarLogo.png";

export default function NavBar({
  navOpen,
  setNavOpen,
  userMenuOpen,
  setUserMenuOpen,
  isDark,
  onToggleTheme,
}) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isDashboard = location.pathname === "/";
  const isDatasources = location.pathname.startsWith("/data-sources");
  const isIndexFunds = location.pathname.startsWith("/index-funds");
  const isConnectedApps = location.pathname.startsWith("/connected-apps");
  const isAbout = location.pathname.startsWith("/about");
  const isFeedback = location.pathname.startsWith("/feedback");

  // ✅ ESC closes nav (and dropdown)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setNavOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setNavOpen, setUserMenuOpen]);

  const closeNav = () => setNavOpen(false);

  const handleHamburgerClick = (event) => {
    event.stopPropagation();
    setUserMenuOpen(false); // don't stack menus
    setNavOpen((open) => !open);
  };

  const handleAvatarClick = (event) => {
    event.stopPropagation();
    setNavOpen(false); // don't stack menus
    setUserMenuOpen((open) => !open);
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setNavOpen(false);
  };

  return (
    <>
      {/* ✅ Mobile overlay: click to close */}
      {navOpen && <div className="nav-overlay" onClick={() => setNavOpen(false)} />}

      {/* Side nav */}
      <aside className="side-nav" onClick={(e) => e.stopPropagation()}>
        <div className="side-nav-brand">
          <div className="side-nav-logo">
            <img
              src={dapperSquirrel}
              alt="Lucent squirrel"
              className="side-nav-logo-img"
              draggable="false"
            />
          </div>

          <div className="side-nav-brand-text">
            <span className="side-nav-name">Lucent Financial</span>
            <span className="side-nav-tagline">Financial Intelligence</span>
          </div>
        </div>

        <nav className="side-nav-menu">
          <Link
            to="/"
            className={"side-nav-item " + (isDashboard ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-icon side-nav-item-icon--dashboard" aria-hidden="true" />
            Dashboard
          </Link>

          <Link
            to="/data-sources"
            className={"side-nav-item " + (isDatasources ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-icon side-nav-item-icon--market" aria-hidden="true" />
            Market & Logs
          </Link>

          <Link
            to="/index-funds"
            className={"side-nav-item " + (isIndexFunds ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-icon side-nav-item-icon--baseline" aria-hidden="true" />
            Market Baselines
          </Link>

          <Link
            to="/connected-apps"
            className={"side-nav-item " + (isConnectedApps ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-icon side-nav-item-icon--broker" aria-hidden="true" />
            Connected Brokers
          </Link>

          <Link
            to="/about"
            className={"side-nav-item " + (isAbout ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-icon side-nav-item-icon--about" aria-hidden="true" />
            About
          </Link>

          <Link
            to="/feedback"
            className={"side-nav-item " + (isFeedback ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-icon side-nav-item-icon--feedback" aria-hidden="true" />
            Feedback
          </Link>

          {/* Sign Out */}
          {user && (
            <button type="button" className="side-nav-item side-nav-signout" onClick={handleLogout}>
              <span className="side-nav-item-icon side-nav-item-icon--logout" aria-hidden="true" />
              Sign out
            </button>
          )}
        </nav>

        <div className="side-nav-footer">
          <div className="side-nav-footer-divider" />
          <span className="side-nav-footer-name">Made by Ericka James</span>
        </div>
      </aside>

      {/* Top bar */}
      <header className="topbar" onClick={(e) => e.stopPropagation()}>
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
            <img
              src={navBarLogo}
              alt=""
              className="topbar-squirrel"
              aria-hidden="true"
              draggable="false"
            />
            <span className="topbar-home-label">U-Stock</span>
          </Link>
        </div>

        <div className="topbar-right">
          {/* theme toggle */}
          <button
            type="button"
            className={`theme-toggle ${isDark ? "theme-toggle--on" : ""}`}
            onClick={onToggleTheme}
            aria-label="Toggle theme"
          >
            <span className="theme-toggle-icon theme-toggle-icon--left" aria-hidden="true">
              {isDark ? "☀" : ""}
            </span>

            <span className="theme-toggle-thumb" />

            <span className="theme-toggle-icon theme-toggle-icon--right" aria-hidden="true">
              {!isDark ? "☾" : ""}
            </span>
          </button>

          {/* ABOUT -> /about */}
          <Link
            className="icon-btn"
            to="/about"
            onClick={() => setUserMenuOpen(false)}
            aria-label="About"
          >
            <span className="icon-info" />
          </Link>

          {/* FEEDBACK -> /feedback */}
          <Link
            className="icon-btn"
            to="/feedback"
            onClick={() => setUserMenuOpen(false)}
            aria-label="Feedback"
          >
            <span className="icon-question" />
          </Link>

          {user && (
            <div className="topbar-user">
              <button
                type="button"
                className="topbar-user-btn"
                onClick={handleAvatarClick}
                aria-label="Open user menu"
              >
                <span className="topbar-user-avatar">{user.avatar || "👤"}</span>
              </button>

              {userMenuOpen && (
                <div className="topbar-user-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="topbar-user-menu-item topbar-user-menu-meta">
                    <div className="topbar-user-menu-email">{user.email}</div>
                  </div>
                  <button type="button" className="topbar-user-menu-item" onClick={handleLogout}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
    </>
  );
}
