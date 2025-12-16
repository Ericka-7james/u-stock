import { API_BASE, API_PREFIX } from "../../config/config";

async function throwReadable(res: Response) {
  let msg = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    // FastAPI uses "detail" a lot
    msg = (data as any)?.detail || msg;
  } catch {
    // ignore json parse failures
  }
  throw new Error(msg);
}

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) await throwReadable(res);
  return res.json();
}

export async function fetchLatestStocks(symbols: string[]) {
  const qs = `symbols=${encodeURIComponent(symbols.join(","))}`;
  return fetchJson(`${API_BASE}${API_PREFIX}/market/latest/stocks?${qs}`);
}

export async function fetchLatestCrypto(symbols: string[], loc = "us") {
  const qs = `loc=${encodeURIComponent(loc)}&symbols=${encodeURIComponent(symbols.join(","))}`;
  return fetchJson(`${API_BASE}${API_PREFIX}/market/latest/crypto?${qs}`);
}
