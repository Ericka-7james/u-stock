// frontend/src/hooks/common/useIsDarkMode.js
import { useEffect, useState } from "react";

function readIsDarkMode() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  const body = document.body;
  return (
    root?.classList?.contains("dark") ||
    body?.classList?.contains("dark") ||
    root?.getAttribute("data-theme") === "dark"
  );
}

export default function useIsDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(readIsDarkMode);

  useEffect(() => {
    const obs = new MutationObserver(() => setIsDarkMode(readIsDarkMode()));
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  return isDarkMode;
}