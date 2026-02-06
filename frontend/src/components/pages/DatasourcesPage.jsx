// src/components/pages/DatasourcesPage.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell";
import PageHeaderCard from "../common/PageHeaderCard.jsx";

import MarketLeadersCard from "../dashboard/cards/MarketLeadersCard.jsx";
import BotLogsCard from "../dashboard/cards/BotLogsCard.jsx";

import DatasourcesSquirrel from "../../assets/images/DatasourcesSquirrel.png";

import "../../css/pages/DatasourcesPage.css";
import "../../css/dashboard/cards/CardShared.css";

// -------- Small in-memory cache (stale-while-revalidate) --------
const CACHE_TTL_MS = 60_000;

const leadersCache = {
  ts: 0,
  items: [],
  meta: { source: "alpaca_movers" },
};

function isFresh(ts) {
  return Date.now() - Number(ts || 0) < CACHE_TTL_MS;
}

async function apiGet(url, { signal } = {}) {
  const res = await fetch(url, { credentials: "include", signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

// Retry once (never retry aborts)
async function apiGetWithRetry(url, { signal } = {}) {
  try {
    return await apiGet(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    return await apiGet(url, { signal });
  }
}

function normalizeSymbol(sym) {
  const s = String(sym || "").trim();
  if (!s) return "";
  const last = s.includes(":") ? s.split(":").pop() : s;
  return last.toUpperCase();
}

function isTvSafe(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
}

function useMarketLeaders() {
  const [items, setItems] = useState(() => (isFresh(leadersCache.ts) ? leadersCache.items : []));
  const [meta, setMeta] = useState(() =>
    isFresh(leadersCache.ts) ? leadersCache.meta : { source: "alpaca_movers" }
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      const hasFresh = isFresh(leadersCache.ts) && Array.isArray(leadersCache.items);
      if (!hasFresh) setLoading(true);

      try {
        const json = await apiGetWithRetry("/api/market/leaders?market=stocks&direction=up&limit=8", {
          signal: ac.signal,
        });
        if (!alive || ac.signal.aborted) return;

        const nextItems = Array.isArray(json?.items) ? json.items : [];
        const nextMeta = {
          source:
            json?.source || {
              code: "alpaca_movers",
              label: "Alpaca market movers (today)",
            },
          asOf: json?.asOf || null,
        };

        setItems(nextItems);
        setMeta(nextMeta);

        leadersCache.ts = Date.now();
        leadersCache.items = nextItems;
        leadersCache.meta = nextMeta;
      } catch {
        // keep page clean; MarketLeadersCard can handle empty
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      ac.abort();
    };
  }, []);

  return { items, meta, loading };
}

export default function DatasourcesPage() {
  const navigate = useNavigate();
  const { items: leaders, meta: leadersMeta, loading: leadersLoading } = useMarketLeaders();

  return (
    <AppShell>
      <div className="app-page datasources-page">
        {/* ✅ Match ConnectedAppsPage: PageHeaderCard stands alone (it already clamps via .page-header-wrap) */}
        <PageHeaderCard
          title="Data Sources"
          subtitle={
            <>
              This page is for <strong>market context + observability</strong> — view today’s top movers and filter bot
              logs to validate behavior. (Start/Stop controls live on the Dashboard.)
            </>
          }
          right={<img src={DatasourcesSquirrel} alt="DatasourcesSquirrel" className="datasources-hero-logo" />}
        >
          <div className="ds-header-actions">
            <Link to="/" className="back-link-pill">
              ← Back to dashboard
            </Link>
            <Link to="/connected-apps" className="back-link-pill">
              Connected apps →
            </Link>
          </div>
        </PageHeaderCard>

        {/* ✅ Match ConnectedAppsPage: content lane aligned to the same max-width + gutters */}
        <div className="ds-page-wrap">
          <main className="ds-main">
            <div className="ds-left">
              <div className="ds-cardClamp">
                <MarketLeadersCard
                  title="Market leaders"
                  subtitle="Top movers (today). Click a ticker to load it on the dashboard chart."
                  items={leaders}
                  meta={leadersMeta}
                  loading={leadersLoading}
                  onSelectSymbol={(sym) => {
                    const clean = normalizeSymbol(sym);
                    if (!clean) return;
                    if (!isTvSafe(clean)) return;

                    try {
                      localStorage.setItem("ustock:last_ticker", clean);
                    } catch {}

                    navigate(`/?ticker=${encodeURIComponent(clean)}`);
                  }}
                />
              </div>
            </div>

            <div className="ds-right">
              <BotLogsCard
                defaultBotId="ema_trend"
                maxPreview={3}
                title="Bot logs"
                subtitle="Filter by day, status, and search terms. Use logs to debug decisions + runner health."
                showQuickLink={true}
              />
            </div>
          </main>
        </div>
      </div>
    </AppShell>
  );
}
