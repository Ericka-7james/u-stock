// frontend/src/hooks/dashboard/useConnectBotNudge.js
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiGetWithRetry } from "../../lib/api/http.js";
import { LS } from "../../lib/storage/keys.js";
import { lsGet, lsRemove } from "../../lib/storage/localStorage.js";

import welcomeBackImg from "../../assets/modal/WelcomeBack.png";

/**
 * useConnectBotNudge
 *
 * Responsibility:
 * - On "just authed" (login/signup), check if user has a connected bot.
 * - If not, show a modal payload prompting them to connect a bot.
 * - Clear the "just authed" flags so it doesn't show repeatedly.
 *
 * Returns:
 * - open: boolean
 * - payload: ErrorModal-friendly object (title/body/subtitle/image/action)
 * - onClose: close modal
 * - onAction: close modal + optional navigate(action.href)
 */
export default function useConnectBotNudge({
  botAvailablePath = "/api/bots/available",
  connectHref = "/bots",
} = {}) {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(null);

  const onClose = useCallback(() => {
    setOpen(false);
    setPayload(null);
  }, []);

  const onAction = useCallback(
    (action) => {
      // Always close first, then navigate.
      onClose();
      if (action?.href) navigate(action.href);
    },
    [navigate, onClose]
  );

  const checkHasConnectedBot = useCallback(
    async ({ signal } = {}) => {
      // Fast client hint (lets you avoid network when already known)
      if (lsGet(LS.BOT_CONNECTED_HINT, "0") === "1") return true;

      // Backend check: "do we have bots available to connect?"
      // (still works even if "connected bot" isn’t fully modeled yet)
      try {
        const json = await apiGetWithRetry(botAvailablePath, { signal });
        if (json && typeof json === "object" && Array.isArray(json.bots)) {
          return json.bots.length > 0;
        }
      } catch {
        // If endpoint isn't implemented or fails, do not block UI.
        return false;
      }

      return false;
    },
    [botAvailablePath]
  );

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      // Only nudge when we *just* authed
      const justAuthed = lsGet(LS.JUST_AUTHED, "0") === "1";
      const kind = lsGet(LS.JUST_AUTHED_KIND, "login") || "login"; // "signup" | "login"

      if (!justAuthed || !alive) return;

      const hasBot = await checkHasConnectedBot({ signal: ac.signal }).catch(() => false);
      if (!alive || ac.signal.aborted) return;

      if (!hasBot) {
        const title = kind === "signup" ? "Welcome to Lucent 👋" : "Welcome back 👋";
        const body =
          kind === "signup"
            ? "Next step: connect a bot so you can start/pause strategies and see activity in your dashboard."
            : "Quick reminder: connect a bot to start/pause strategies and keep your dashboard data in sync.";

        setPayload({
          title,
          body,
          subtitle: "Tip: You can change bots later from the Bot Runner page.",
          image: welcomeBackImg,
          action: { label: "Connect a bot", href: connectHref },
        });
        setOpen(true);
      }

      // Always clear the flags so the nudge is one-time
      lsRemove(LS.JUST_AUTHED);
      lsRemove(LS.JUST_AUTHED_KIND);
    }

    run();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [checkHasConnectedBot, connectHref]);

  return { open, payload, onClose, onAction };
}