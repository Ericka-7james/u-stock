import { useEffect, useState } from "react";
import "../../css/common/FullPageLoader.css";

import f1 from "../../assets/loading/LoadingScreen1.png";
import f2 from "../../assets/loading/LoadingScreen2.png";
import f3 from "../../assets/loading/LoadingScreen3.png";

const FRAMES = [f1, f2, f3];

export default function FullPageLoader({ label = "Loading…" }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((i) => (i + 1) % FRAMES.length);
    }, 120); // tweak: 100–150ms feels best

    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fpl-wrap"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="fpl-card">
        {/* 🔁 RUN CYCLE */}
        <img
          src={FRAMES[frame]}
          alt=""
          className="fpl-loader-image"
        />

        <div className="fpl-text">{label}</div>
      </div>
    </div>
  );
}
