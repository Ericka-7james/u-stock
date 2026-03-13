// src/components/layout/NavBar.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContextBase.js";
import AuthRequiredModal from "../common/AuthRequiredModal";
import "../../css/layout/NavBar.css";

import LucentAppIcon from "../../assets/icons/LucentAppIcon.png"; // ✅ updated logo


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
  const navigate = useNavigate();

  const [authModalOpen, setAuthModalOpen] = useState(false);

  const isDashboard = location.pathname === "/";
  const isDatasources = location.pathname.startsWith("/data-sources");
  const isIndexFunds = location.pathname.startsWith("/index-funds");
  const isConnectedApps = location.pathname.startsWith("/connected-apps");
  const isAbout = location.pathname.startsWith("/about");
  const isFeedback = location.pathname.startsWith("/feedback");
  const isPracticeBacktests = location.pathname.startsWith("/practice/backtests");

  // Pages that require auth
  const protectedPaths = useMemo(
    () => new Set(["/data-sources", "/index-funds", "/connected-apps", "/practice"]),
    []
  );

  const isProtectedPath = (to) => {
    if (!to) return false;
    // handle "/data-sources/xyz" etc
    for (const p of protectedPaths) {
      if (to === p || to.startsWith(p + "/")) return true;
    }
    return false;
  };

  const openAuthModalFor = () => {
    setAuthModalOpen(true);
  };

  const handleNavTo = (to) => (e) => {
    // If route requires auth and user isn't signed in -> block + show modal
    if (!user && isProtectedPath(to)) {
      e.preventDefault();
      setUserMenuOpen(false);
      setNavOpen(false);
      openAuthModalFor();
      return;
    }

    // Normal navigation behavior
    setUserMenuOpen(false);
    setNavOpen(false);
  };

  // ✅ ESC closes nav (and dropdown + modal)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setNavOpen(false);
        setUserMenuOpen(false);
        setAuthModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setNavOpen, setUserMenuOpen]);

  const handleHamburgerClick = (event) => {
    event.stopPropagation();
    setUserMenuOpen(false);
    setNavOpen((open) => !open);
  };

  const handleAvatarClick = (event) => {
    event.stopPropagation();
    setNavOpen(false);
    setUserMenuOpen((open) => !open);
  };

  const handleLogout = async () => {
    try {
      await logout(); // ✅ wait for cookies + hint to clear
    } finally {
      setUserMenuOpen(false);
      setNavOpen(false);

      // ✅ make it feel “real” even on public pages like /feedback
      navigate("/auth", { replace: true });

      // optional: if you ever see stale UI due to cached state, use hard reset instead:
      // window.location.assign("/auth");
    }
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const goToAuth = () => {
    // update this if your route is different
    navigate("/auth");
    closeAuthModal();
  };

  return (
    <>
      {/* Auth required modal */}
      <AuthRequiredModal
        open={authModalOpen}
        title="Uh oh!"
        message="You need to sign in to access that page."
        onClose={closeAuthModal}
        onPrimary={goToAuth}
        primaryLabel="Sign in"
        secondaryLabel="Cancel"
      />

      {/* ✅ Mobile overlay: click to close */}
      {navOpen && <div className="nav-overlay" onClick={() => setNavOpen(false)} />}

      {/* Side nav */}
      <aside className="side-nav" onClick={(e) => e.stopPropagation()}>
        <div className="side-nav-brand">
          <div className="side-nav-logo">
            <img
              src={LucentAppIcon}
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
            onClick={handleNavTo("/")}
          >
            <span className="side-nav-item-icon" aria-hidden="true" />
            Dashboard
          </Link>

          <Link
            to="/data-sources"
            className={"side-nav-item " + (isDatasources ? "side-nav-item--active" : "")}
            onClick={handleNavTo("/data-sources")}
          >
            <span className="side-nav-item-icon" aria-hidden="true" />
            Market & Logs
          </Link>

          <Link
            to="/index-funds"
            className={"side-nav-item " + (isIndexFunds ? "side-nav-item--active" : "")}
            onClick={handleNavTo("/index-funds")}
          >
            <span className="side-nav-item-icon" aria-hidden="true" />
            Market Baselines
          </Link>

          <Link
            to="/connected-apps"
            className={"side-nav-item " + (isConnectedApps ? "side-nav-item--active" : "")}
            onClick={handleNavTo("/connected-apps")}
          >
            <span className="side-nav-item-icon" aria-hidden="true" />
            Connected Brokers
          </Link>

          <Link
            to="/about"
            className={"side-nav-item " + (isAbout ? "side-nav-item--active" : "")}
            onClick={handleNavTo("/about")}
          >
            <span className="side-nav-item-icon" aria-hidden="true" />
            About
          </Link>

          <Link
            to="/practice/backtests"
            className={
              "side-nav-item " + (isPracticeBacktests ? "side-nav-item--active" : "")
            }
            onClick={handleNavTo("/practice/backtests")}
          >
            <span className="side-nav-item-icon" aria-hidden="true" />
            Backtest Practice
          </Link>

          <Link
            to="/feedback"
            className={"side-nav-item " + (isFeedback ? "side-nav-item--active" : "")}
            onClick={handleNavTo("/feedback")}
          >
            <span className="side-nav-item-icon" aria-hidden="true" />
            Feedback
          </Link>

          {/* Sign Out */}
          {user && (
            <button type="button" className="side-nav-item side-nav-signout" onClick={handleLogout}>
              <span className="side-nav-item-icon" aria-hidden="true" />
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

          <Link to="/" className="topbar-home-link" onClick={handleNavTo("/")}>
            <img
              src={LucentAppIcon}
              alt=""
              className="topbar-squirrel"
              aria-hidden="true"
              draggable="false"
            />
            <span className="topbar-home-label topbar-home-label--full">
              Lucent Financial
            </span>
            <span className="topbar-home-label topbar-home-label--short">
              UStock
            </span>
          </Link>
        </div>

        <div className="topbar-right">
          {/* theme toggle: moon right in light mode, sun left in dark mode */}
          <button
            type="button"
            className={`theme-toggle ${isDark ? "theme-toggle--on" : ""}`}
            onClick={onToggleTheme}
            aria-label="Toggle theme"
          >
            <span className="theme-toggle-sun" aria-hidden="true">
              ☀
            </span>
            <span className="theme-toggle-thumb" />
            <span className="theme-toggle-moon" aria-hidden="true">
              ☾
            </span>
          </button>

          {/* ABOUT -> /about */}
          <Link className="icon-btn" to="/about" onClick={() => setUserMenuOpen(false)} aria-label="About">
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
