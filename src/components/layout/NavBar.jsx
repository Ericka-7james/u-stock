// src/components/layout/NavBar.jsx
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./NavBar.css";

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
  const isAboutMe = location.pathname.startsWith("/about");
  const isFeedback = location.pathname.startsWith("/feedback");
  // const isResume = location.pathname.startsWith("/resume"); // ✅ you already had this
  const isConnectedApps = location.pathname.startsWith("/connected-apps");

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
            <span className="side-nav-name">U-Stock</span>
            <span className="side-nav-tagline">Radar Suite</span>
          </div>
        </div>

        <nav className="side-nav-menu">
          {/* 🔹 NEW: Resume link (public) */}
          {/* <Link
            to="/resume"
            className={
              "side-nav-item " + (isResume ? "side-nav-item--active" : "")
            }
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Resume
          </Link> */}

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
              "side-nav-item " +
              (isDatasources ? "side-nav-item--active" : "")
            }
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Data Sources
          </Link>

          <Link
            to="/index-funds"
            className={
              "side-nav-item " + (isIndexFunds ? "side-nav-item--active" : "")
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

          <Link
            to="/connected-apps"
            className={
              "side-nav-item " + (isConnectedApps ? "side-nav-item--active" : "")
            }
            onClick={closeNav}
          >
            <span className="side-nav-item-dot" />
            Connected Apps
          </Link>

          {/* Sign Out stays the same */}
          {user && (
            <button
              type="button"
              className="side-nav-item side-nav-signout"
              onClick={() => {
                handleLogout();
                closeNav();
              }}
            >
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

      {/* Top bar stays exactly as you had it */}
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
                <span className="topbar-user-avatar">
                  {user.avatar || "👤"}
                </span>
              </button>

              {userMenuOpen && (
                <div className="topbar-user-menu">
                  <div className="topbar-user-menu-item topbar-user-menu-meta">
                    <div className="topbar-user-menu-email">{user.email}</div>
                  </div>
                  <button
                    type="button"
                    className="topbar-user-menu-item"
                    onClick={handleLogout}
                  >
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
