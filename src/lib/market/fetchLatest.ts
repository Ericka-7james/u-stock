import { API_BASE } from "../../config/config";

export async function fetchLatestStocks(symbols: string[]) {
  const res = await fetch(
    `${API_BASE}/api/market/latest/stocks?symbols=${encodeURIComponent(symbols.join(","))}`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`Failed to fetch stock data (${res.status})`);
  return res.json();
}

export async function fetchLatestCrypto(symbols: string[], loc = "us") {
  const res = await fetch(
    `${API_BASE}/api/market/latest/crypto?loc=${loc}&symbols=${encodeURIComponent(symbols.join(","))}`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`Failed to fetch crypto data (${res.status})`);
  return res.json();
}
