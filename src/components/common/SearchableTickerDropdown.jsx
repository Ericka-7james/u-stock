// src/components/common/SearchableTickerDropdown.jsx
import { useMemo, useState, useRef, useEffect } from "react";
import "../../css/SearchableTickerDropdown.css";
const MAX_VISIBLE_OPTIONS = 300;

export default function SearchableTickerDropdown({
  allTickers,
  currentTicker,
  onChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  const filteredTickers = useMemo(() => {
    const universe = Array.isArray(allTickers) ? allTickers : [];
    if (!filter.trim()) return universe;

    const q = filter.trim().toUpperCase();
    return universe.filter((sym) => sym.toUpperCase().startsWith(q));
  }, [allTickers, filter]);

  const optionsTickers = useMemo(() => {
    return filteredTickers.slice(0, MAX_VISIBLE_OPTIONS);
  }, [filteredTickers]);

  const label = currentTicker || "Select…";

  const handleSelect = (sym) => {
    onChange(sym);
    setIsOpen(false);
    setFilter("");
  };

  return (
    <div className="chart-search-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="chart-select chart-select--button"
        onClick={() => setIsOpen((open) => !open)}
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

          <ul className="chart-select-options">
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
                    (sym === currentTicker
                      ? " chart-select-option--active"
                      : "")
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
