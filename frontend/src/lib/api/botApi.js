// frontend/src/lib/api/botApi.js

async function safeRead(res) {
  const ct = res?.headers?.get?.("content-type") || "";
  if (ct.includes("application/json")) {
    const json = await res.json().catch(() => null);
    return { json, text: "" };
  }
  const text = await res.text().catch(() => "");
  return { json: null, text };
}

function toErrorPayload(res, data) {
  const status = res?.status || 0;
  const statusText = res?.statusText || "";

  const detail =
    (data && typeof data === "object" && (data.detail || data.error || data.message)) || null;

  const msg =
    (typeof detail === "string" ? detail : detail?.message || detail?.detail) ||
    (typeof data === "string" ? data : "") ||
    `Request failed (${status})`;

  return {
    status,
    statusText,
    detail: typeof detail === "string" ? { message: detail } : detail,
    message: String(msg || "").trim() || `Request failed (${status})`,
    payload: data,
  };
}

function withQuery(url, params) {
  if (!params || typeof params !== "object") return url;

  // Works for "/api/..." relative URLs too
  const u = new URL(url, window.location.origin);

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    u.searchParams.set(k, s);
  }

  // Return relative if caller provided relative (keeps logs tidy)
  if (String(url).startsWith("/")) return u.pathname + (u.search ? u.search : "");
  return u.toString();
}

// ✅ NEW SIGNATURE: apiGet(url, params?, options?)
export async function apiGet(url, params = {}, { signal } = {}) {
  const finalUrl = withQuery(url, params);

  const res = await fetch(finalUrl, {
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  });

  const { json, text } = await safeRead(res);
  const data = json ?? text;

  if (!res.ok) throw toErrorPayload(res, data);
  return typeof data === "object" ? data : { ok: true, raw: data };
}

// ✅ NEW SIGNATURE: apiPost(url, body, params?, options?)
export async function apiPost(url, body, params = {}, { signal } = {}) {
  const finalUrl = withQuery(url, params);

  const res = await fetch(finalUrl, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const { json, text } = await safeRead(res);
  const data = json ?? text;

  if (!res.ok) throw toErrorPayload(res, data);
  return typeof data === "object" ? data : { ok: true, raw: data };
}