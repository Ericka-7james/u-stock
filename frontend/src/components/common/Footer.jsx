// src/components/common/Footer.jsx
import "../../css/common/Footer.css";

const START_YEAR = 2025;
const CURRENT_YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        © {START_YEAR}
        {CURRENT_YEAR > START_YEAR && ` – ${CURRENT_YEAR}`} Lucent Financial. All rights reserved.
      </div>
    </footer>
  );
}