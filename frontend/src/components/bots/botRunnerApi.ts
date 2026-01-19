import { BotStatus, ProviderStatus } from "./botRunner.types";

/**
 * IMPORTANT:
 * Replace these URLs with your backend routes.
 * These are intentionally minimal and easy to wire.
 */

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.detail || data?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchProviderStatus(): Promise<ProviderStatus> {
  // Example: GET /api/integrations/status
  // expected response: { alpacaConnected: true }
  return req<ProviderStatus>("/api/integrations/status");
}

export async function fetchBotStatuses(): Promise<Record<string, BotStatus>> {
  // Example: GET /api/bots/status
  // expected response:
  // {
  //   "orb": { "id":"orb", "state":"running", "lastChangedAt":"...", "message":"" },
  //   "ema_vwap": { "id":"ema_vwap", "state":"stopped" }
  // }
  return req<Record<string, BotStatus>>("/api/bots/status");
}

export async function startBot(botId: string): Promise<{ ok: boolean }> {
  // Example: POST /api/bots/start  body: { botId }
  return req<{ ok: boolean }>("/api/bots/start", {
    method: "POST",
    body: JSON.stringify({ botId }),
  });
}

export async function stopBot(botId: string): Promise<{ ok: boolean }> {
  // Example: POST /api/bots/stop  body: { botId }
  return req<{ ok: boolean }>("/api/bots/stop", {
    method: "POST",
    body: JSON.stringify({ botId }),
  });
}
