// frontend/src/lib/api/http.js

export function toError(e) {
  if (e instanceof Error) return e;
  const msg =
    typeof e === "string"
      ? e
      : e?.message
        ? String(e.message)
        : JSON.stringify(e);
  return new Error(msg);
}

export async function apiGet(path, { signal } = {}) {
  const res = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      (typeof json === "object" && (json?.detail || json?.error || json?.message)) ||
      `Request failed (${res.status})`;

    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return typeof json === "object" ? json : { ok: true, raw: json };
}

export async function apiGetWithRetry(path, { signal } = {}) {
  try {
    return await apiGet(path, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    return await apiGet(path, { signal });
  }
}