import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const expected = Deno.env.get("CRON_SECRET") ?? "";
    const provided = req.headers.get("x-cron-secret") ?? "";

    if (!expected || provided !== expected) {
      return json({ error: "unauthorized" }, 401);
    }

    // GET = health check
    if (req.method === "GET") {
      return json({
        ok: true,
        msg: "market-snapshot alive",
        now_utc: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    // POST = parse JSON if present
    const text = await req.text();
    const payload = text ? JSON.parse(text) : {};

    return json({ ok: true, received: payload, now_utc: new Date().toISOString() });
  } catch (e) {
    console.error("market-snapshot error:", e);
    return json({ error: String(e) }, 500);
  }
});
