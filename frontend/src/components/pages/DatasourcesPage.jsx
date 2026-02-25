// src/components/pages/DatasourcesPage.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell";
import PageHeaderCard from "../common/PageHeaderCard.jsx";

import MarketLeadersCard from "../dashboard/cards/MarketLeadersCard.jsx";
import BotLogsCard from "../dashboard/cards/BotLogsCard.jsx";

import DatasourcesSquirrel from "../../assets/pages/DatasourcesSquirrel.png";

import "../../css/pages/DatasourcesPage.css";
import "../../css/dashboard/cards/CardShared.css";

import { DATASOURCES_PAGE_COPY } from "../../content/datasources.content.ts";

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
        // ✅ no return in finally (no-unsafe-finally)
        if (alive) setLoading(false);
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

  const c = DATASOURCES_PAGE_COPY;

  return (
    <AppShell>
      <div className="datasources-page">
        <PageHeaderCard
          title={c.header.title}
          subtitle={
            <>
              {c.header.subtitle.split("market context + observability").map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>
                    {part}
                    <strong>market context + observability</strong>
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </>
          }
          right={<img src={DatasourcesSquirrel} alt="DatasourcesSquirrel" className="datasources-hero-logo" />}
        >
          <div className="ds-header-actions">
            <Link to="/" className="back-link-pill">
              {c.header.actions.backToDashboardLabel}
            </Link>
            <Link to="/connected-apps" className="back-link-pill">
              {c.header.actions.connectedAppsLabel}
            </Link>
          </div>
        </PageHeaderCard>

        <div className="ds-page-wrap">
          <main className="ds-main">
            <div className="ds-left">
              <div className="ds-cardClamp">
                <MarketLeadersCard
                  title={c.cards.marketLeaders.title}
                  subtitle={c.cards.marketLeaders.subtitle}
                  items={leaders}
                  meta={leadersMeta}
                  loading={leadersLoading}
                  onSelectSymbol={(sym) => {
                    const clean = normalizeSymbol(sym);
                    if (!clean) return;
                    if (!isTvSafe(clean)) return;

                    try {
                      localStorage.setItem("ustock:last_ticker", clean);
                    } catch {
                      // ignore storage failures (private mode, blocked storage, etc.)
                    }

                    navigate(`/?ticker=${encodeURIComponent(clean)}`);
                  }}
                />
              </div>
            </div>

            <div className="ds-right">
              <BotLogsCard
                defaultBotId={c.cards.botLogs.defaultBotId}
                maxPreview={c.cards.botLogs.maxPreview}
                title={c.cards.botLogs.title}
                subtitle={c.cards.botLogs.subtitle}
                showQuickLink={c.cards.botLogs.showQuickLink}
              />
            </div>
          </main>
        </div>
      </div>
    </AppShell>
  );
}