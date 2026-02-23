// frontend/src/lib/api/json.js

async function safeReadJson(res) {
  const ct = res?.headers?.get?.("content-type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * GET JSON with credentials, consistent error messages.
 * Returns parsed JSON (or null if server didn't send JSON).
 */
export async function getJson(path, { signal, headers } = {}) {
  const res = await fetch(path, {
    method: "GET",
    credentials: "include",
    signal,
    headers: { Accept: "application/json", ...(headers || {}) },
  });

  const json = await safeReadJson(res);

  if (!res.ok) {
    const detail = json?.detail?.message || json?.detail || json?.message || `Request failed (${res.status})`;
    const err = new Error(typeof detail === "string" ? detail : "Request failed");
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}