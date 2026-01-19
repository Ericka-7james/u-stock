export type BotRunState = "running" | "stopped" | "error" | "unknown";

export type BotDefinition = {
  id: string;
  name: string;
};

export type ProviderStatus = {
  alpacaConnected: boolean;
  // Expand later: polygonConnected, etc.
};

export type BotStatus = {
  id: string;
  state: BotRunState;
  message?: string; // optional detail like “Awaiting market open”
  lastChangedAt?: string; // ISO string
};
