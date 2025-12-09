// src/components/layout/AppShell.jsx
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./AppShell.css";

export default function AppShell({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ dark-mode state
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("ustock-theme");
    return stored === "dark";
  });

  const isDashboard = location.pathname === "/";
  const isDatasources = location.pathname.startsWith("/data-sources");
  const isIndexFunds = location.pathname.startsWith("/index-funds");
  const isAboutMe = location.pathname.startsWith("/about");
  const isFeedback = location.pathname.startsWith("/feedback");

  const closeNav = () => setNavOpen(false);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  useEffect(() => {
    const dark = isDark;
    document.body.classList.toggle("ustock-dark", dark);
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light"
    );
    window.localStorage.setItem("ustock-theme", dark ? "dark" : "light");
  }, [isDark]);

  const handleMainClick = () => {
    if (navOpen) setNavOpen(false);
    if (userMenuOpen) setUserMenuOpen(false);
  };

  const handleHamburgerClick = (event) => {
    event.stopPropagation();
    setNavOpen((open) => !open);
  };

  const handleAvatarClick = (event) => {
    event.stopPropagation();
    setUserMenuOpen((open) => !open);
  };

  const handleLogout = () => {
    // Clear auth + navigate to "/" inside AuthContext
    logout();
    setUserMenuOpen(false);
    // ❌ do NOT navigate("/auth") here
    // If you really want to be explicit you *could*:
    // navigate("/", { replace: true });
  };

  return (
    <div className={`app-shell ${navOpen ? "app-shell--nav-open" : ""}`}>
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

      {/* Main area */}
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
            {/* dark mode toggle */}
            <button
              type="button"
              className={`theme-toggle ${isDark ? "theme-toggle--on" : ""}`}
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
            >
              <span className="theme-toggle-thumb" />
              <span className="theme-toggle-moon">☾</span>
            </button>

            <button
              className="icon-btn"
              type="button"
              onClick={() => alert("Coming soon")}
            >
              <span className="icon-search" />
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => alert("Coming soon")}
            >
              <span className="icon-bell" />
            </button>

            {/* User avatar + logout menu */}
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
                      <div className="topbar-user-menu-email">
                        {user.email}
                      </div>
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
