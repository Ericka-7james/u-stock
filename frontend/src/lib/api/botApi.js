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

export async function apiGet(url, { signal } = {}) {
  const res = await fetch(url, {
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  });
  const { json, text } = await safeRead(res);
  const data = json ?? text;

  if (!res.ok) throw toErrorPayload(res, data);
  return typeof data === "object" ? data : { ok: true, raw: data };
}

export async function apiPost(url, body, { signal } = {}) {
  const res = await fetch(url, {
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
