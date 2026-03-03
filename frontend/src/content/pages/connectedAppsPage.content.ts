// frontend/src/content/pages/connectedAppsPage.content.ts

export const CONNECTED_APPS_PAGE_COPY = {
  header: {
    title: "Connected Apps",
    subtitle: "Connect brokers and data providers to power charts, backtests, and supervised automation.",
  },

  hero: {
    primary:
      "Lucent works best when you can see what’s happening and why. Connected apps power clean market context, strategy signals, and (optionally) execution you explicitly enable.",
    secondary:
      "Keys are stored server-side and never kept in the browser. Nothing trades unless you turn a strategy on and route it to live execution.",
    termsCta: "Terms & usage",
    refreshedLabel: "Last refreshed:",
    tipWhenNotRefreshed: "Tip: Connect at least one provider to unlock market data features.",
  },

  banners: {
    notSignedIn: {
      singleProviderTemplate: "You’re not signed in. Sign in to connect {provider}.",
      multiProvider: "You’re not signed in. Sign in to connect and manage your integrations.",
      cta: "Sign in",
    },
  },

  providers: [
    {
      key: "alpaca",
      name: "Alpaca",
      desc: "Broker integration for paper trading and (optional) live execution.",
      tags: ["Paper trading", "Broker API", "Execution routing"],
      docsUrl: "https://docs.alpaca.markets/",
      learnMoreLabel: "Alpaca docs",
      connectLabel: "Connect",
    },
    {
      key: "polygon",
      name: "Polygon.io",
      desc: "Market data provider for aggregates and intraday pricing.",
      tags: ["Intraday candles", "Aggregates", "Real-time"],
      docsUrl: "https://polygon.io/docs",
      learnMoreLabel: "Polygon docs",
      connectLabel: "Connect",
    },
    {
      key: "tradingview",
      name: "TradingView",
      desc: "Charting + alerts. Often used via webhooks and notifications.",
      tags: ["Charts", "Alerts", "Webhooks"],
      docsUrl: "https://www.tradingview.com/rest-api-spec/",
      learnMoreLabel: "TradingView API",
      connectLabel: "Connect",
    },
  ] as const,

  statuses: {
    connected: "Connected",
    notConnected: "Not connected",
  },

  actions: {
    disconnect: "Disconnect",
    refresh: "Refresh",
    learnMoreFallback: "Learn more",
  },

  confirmations: {
    disconnectTitleTemplate: "Disconnect {provider}?",
    disconnectBody:
      "This removes the connection from Lucent. You can reconnect anytime.",
    disconnectNotYetWired:
      "Disconnect flow will be wired next (backend endpoint). For now, reconnecting is available via Connect.",
  },

  emptyState: {
    hint:
      "No providers connected yet. Start with Alpaca for paper trading, or Polygon for dedicated market data.",
  },

  info: {
    howTitle: "How connections are used",
    howItems: [
      "Data providers power charts, price history, and intraday moves.",
      "Broker connections allow strategies to simulate or place trades when you enable them.",
      "You stay in control: nothing trades unless you explicitly turn a strategy on.",
    ],

    nextTitle: "Next steps",
    nextItems: [
      {
        prefix: "Start/pause strategies in",
        ctaLabel: "Bot Runner",
        to: "/bots",
      },
      {
        prefix: "View recent activity in",
        ctaLabel: "Bot Logs",
        to: "/datasources",
      },
    ],
  },
} as const;