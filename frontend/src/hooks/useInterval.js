// frontend/src/hooks/useInterval.js
import { useEffect, useRef } from "react";

/**
 * useInterval(callback, delay)
 *
 * - Runs `callback` every `delay` ms.
 * - If delay is null/undefined, the interval is paused.
 * - Uses a ref so it always calls the latest callback without resetting interval.
 *
 * Example:
 *   useInterval(() => refresh(), 30_000);
 *   useInterval(() => poll(), isEnabled ? 4_000 : null);
 */
export default function useInterval(callback, delay) {
  const savedCallback = useRef(() => {});

  // Keep latest callback
  useEffect(() => {
    savedCallback.current = typeof callback === "function" ? callback : () => {};
  }, [callback]);

  // Set up interval
  useEffect(() => {
    if (delay === null || delay === undefined) return;
    const d = Number(delay);
    if (!Number.isFinite(d) || d <= 0) return;

    const id = window.setInterval(() => {
      savedCallback.current?.();
    }, d);

    return () => window.clearInterval(id);
  }, [delay]);
}
