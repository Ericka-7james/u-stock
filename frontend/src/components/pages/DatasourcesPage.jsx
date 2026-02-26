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

import { DATASOURCES_PAGE_COPY } from "../../content/pages/datasources.content.js";

// -------- Small in-memory cache (stale-while-revalidate) --------
const leadersCache = {
  ts: 0,
  items: [],
  meta: DATASOURCES_PAGE_COPY.config.marketLeaders.fallbackMeta,
};

function isFresh(ts) {
  const ttl = DATASOURCES_PAGE_COPY.config.cacheTtlMs;
  return Date.now() - Number(ts || 0) < ttl;
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
  const c = DATASOURCES_PAGE_COPY;

  const [items, setItems] = useState(() => (isFresh(leadersCache.ts) ? leadersCache.items : []));
  const [meta, setMeta] = useState(() =>
    isFresh(leadersCache.ts) ? leadersCache.meta : c.config.marketLeaders.fallbackMeta
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      const hasFresh = isFresh(leadersCache.ts) && Array.isArray(leadersCache.items);
      if (!hasFresh) setLoading(true);

      try {
        const json = await apiGetWithRetry(c.config.marketLeaders.endpoint, { signal: ac.signal });
        if (!alive || ac.signal.aborted) return;

        const nextItems = Array.isArray(json?.items) ? json.items : [];
        const nextMeta = {
          source: json?.source || c.config.marketLeaders.fallbackSource,
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
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [c]);

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
              {c.header.subtitle.split(c.header.highlight).map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>
                    {part}
                    <strong>{c.header.highlight}</strong>
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
                      localStorage.setItem(c.config.lastTickerKey, clean);
                    } catch {
                      // ignore storage failures
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