// src/components/layout/AppShell.jsx
import { useEffect, useState } from "react";
import "./AppShell.css";
import NavBar from "./NavBar";

export default function AppShell({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // ✅ dark-mode state (kept here so it applies app-wide)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("ustock-theme");
    return stored === "dark";
  });

  useEffect(() => {
    const dark = isDark;
    document.body.classList.toggle("ustock-dark", dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    window.localStorage.setItem("ustock-theme", dark ? "dark" : "light");
  }, [isDark]);

  const handleMainClick = () => {
    // clicking in main content closes any open overlays
    if (navOpen) setNavOpen(false);
    if (userMenuOpen) setUserMenuOpen(false);
  };

  return (
    <div className={`app-shell ${navOpen ? "app-shell--nav-open" : ""}`}>
      <NavBar
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
      />

      <div className="app-main" onClick={handleMainClick}>
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
