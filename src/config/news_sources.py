# src/config/news_sources.py

"""
Central config for news RSS sources.

All should be free, unauthenticated RSS feeds.
"""

NEWS_SOURCES = [
    # --- Yahoo Finance (broad markets / business) ---
    {
        "id": "yf_top",
        "label": "Yahoo Finance – Top Stories",
        "url": "https://finance.yahoo.com/news/rssindex",
    },
    {
        "id": "yf_markets",
        "label": "Yahoo Finance – Markets",
        "url": "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US",
    },
    {
        "id": "yf_tech",
        "label": "Yahoo Finance – Tech",
        "url": "https://finance.yahoo.com/tech/rssindex",
    },
    {
        "id": "yf_etfs",
        "label": "Yahoo Finance – ETFs",
        "url": "https://finance.yahoo.com/etfs/rssindex",
    },

    # --- MarketWatch ---
    {
        "id": "mw_top",
        "label": "MarketWatch – Top Stories",
        "url": "https://feeds.marketwatch.com/marketwatch/topstories/",
    },
    {
        "id": "mw_markets",
        "label": "MarketWatch – Markets",
        "url": "https://feeds.marketwatch.com/marketwatch/marketpulse/",
    },

    # --- CNBC ---
        # --- CNBC (blocked by 403, removed temporarily) ---
    # {
    #     "id": "cnbc_top",
    #     "label": "CNBC – Top News",
    #     "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    # },
    # {
    #     "id": "cnbc_markets",
    #     "label": "CNBC – Markets",
    #     "url": "https://www.cnbc.com/id/10001147/device/rss/rss.html",
    # },

    # --- WSJ (403 blocked, removed temporarily) ---
    # {
    #     "id": "wsj_markets",
    #     "label": "WSJ – Markets",
    #     "url": "https://feeds.a.dj.com/rss/RSSMarketsMain",
    # },

    # --- Financial Times (front page mix) ---
    {
        "id": "ft_frontpage",
        "label": "Financial Times – Front Page",
        "url": "https://www.ft.com/?format=rss",
    },

    # --- Reuters ---
    {
        "id": "reuters_business",
        "label": "Reuters – Business News",
        "url": "https://feeds.reuters.com/reuters/businessNews",
    },
    {
        "id": "reuters_markets",
        "label": "Reuters – Markets",
        "url": "https://feeds.reuters.com/reuters/USMarketsNews",
    },

    # --- Misc / analysis-heavy ---
    {
        "id": "sa_latest",
        "label": "Seeking Alpha – Latest",
        "url": "https://seekingalpha.com/market_currents.xml",
    },
]
