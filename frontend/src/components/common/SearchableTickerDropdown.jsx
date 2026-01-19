// src/components/common/SearchableTickerDropdown.jsx
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import "../../css/common/SearchableTickerDropdown.css";

const MAX_VISIBLE_OPTIONS = 300;

export default function SearchableTickerDropdown({
  allTickers,
  currentTicker,
  onChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const dropdownRef = useRef(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setFilter("");
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target)) close();
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  const filteredTickers = useMemo(() => {
    const universe = Array.isArray(allTickers) ? allTickers : [];
    if (!filter.trim()) return universe;

    const q = filter.trim().toUpperCase();
    return universe.filter((sym) => String(sym).toUpperCase().startsWith(q));
  }, [allTickers, filter]);

  const optionsTickers = useMemo(
    () => filteredTickers.slice(0, MAX_VISIBLE_OPTIONS),
    [filteredTickers]
  );

  const label = currentTicker || "Select…";

  const handleSelect = (sym) => {
    onChange?.(sym);
    close();
  };

  return (
    <div className="chart-search-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="chart-select chart-select--button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="chart-select-label">{label}</span>
        <span className="chart-select-caret">▾</span>
      </button>

      {isOpen && (
        <div className="chart-select-menu">
          <input
            autoFocus
            className="chart-search-input"
            placeholder="Type to filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <ul className="chart-select-options" role="list">
            {optionsTickers.length === 0 ? (
              <li className="chart-select-option chart-select-option--empty">
                No matches
              </li>
            ) : (
              optionsTickers.map((sym) => (
                <li
                  key={sym}
                  className={
                    "chart-select-option" +
                    (sym === currentTicker ? " chart-select-option--active" : "")
                  }
                  onClick={() => handleSelect(sym)}
                >
                  {sym}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
