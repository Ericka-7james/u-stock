// src/components/layout/NavBar.jsx
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../css/layout/NavBar.css";

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
  const isAbout = location.pathname.startsWith("/about");
  const isFeedback = location.pathname.startsWith("/feedback");
  const isConnectedApps = location.pathname.startsWith("/connected-apps");
  // Candles intentionally removed (page paused)

  const closeNav = () => setNavOpen(false);

  const handleHamburgerClick = (event) => {
    event.stopPropagation();
    setNavOpen((open) => !open);
  };

  const handleAvatarClick = (event) => {
    event.stopPropagation();
    setUserMenuOpen((open) => !open);
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setNavOpen(false);
  };

  return (
    <>
      {/* Side nav */}
      <aside className="side-nav">
        <div className="side-nav-brand">
          <div className="side-nav-logo-circle">U</div>
          <div className="side-nav-brand-text">
            {/* ✅ New branding */}
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
            <span className="side-nav-item-dot" />
            Dashboard
          </Link>

          <Link
            to="/data-sources"
            className={"side-nav-item " + (isDatasources ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Market & Logs
          </Link>

          <Link
            to="/index-funds"
            className={"side-nav-item " + (isIndexFunds ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Market Baselines
          </Link>

          <Link
            to="/connected-apps"
            className={"side-nav-item " + (isConnectedApps ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Connected Brokers
          </Link>

          <Link
            to="/about"
            className={"side-nav-item " + (isAbout ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            About
          </Link>

          <Link
            to="/feedback"
            className={"side-nav-item " + (isFeedback ? "side-nav-item--active" : "")}
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Feedback
          </Link>

          {/* Sign Out */}
          {user && (
            <button type="button" className="side-nav-item side-nav-signout" onClick={handleLogout}>
              <span className="side-nav-item-dot" />
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
          {/* dark mode toggle */}
          <button
            type="button"
            className={`theme-toggle ${isDark ? "theme-toggle--on" : ""}`}
            onClick={onToggleTheme}
            aria-label="Toggle dark mode"
          >
            <span className="theme-toggle-thumb" />
            <span className="theme-toggle-moon">☾</span>
          </button>

          <button
            className="icon-btn"
            type="button"
            onClick={() => {
              setUserMenuOpen(false);
              alert("Coming soon");
            }}
          >
            <span className="icon-search" />
          </button>

          <button
            className="icon-btn"
            type="button"
            onClick={() => {
              setUserMenuOpen(false);
              alert("Coming soon");
            }}
          >
            <span className="icon-bell" />
          </button>

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
                <div className="topbar-user-menu">
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
