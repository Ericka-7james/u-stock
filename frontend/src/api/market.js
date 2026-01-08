export async function fetchTopTickers(authFetch, list="most_active", limit=10) {
  const res = await authFetch(`/market/us/top-tickers?list=${list}&limit=${limit}`, { method: "GET" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Top tickers failed (${res.status}): ${txt.slice(0,120)}`);
  }
  return res.json();
}
