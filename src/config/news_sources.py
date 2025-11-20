# src/data_scout/config/news_sources.py

NEWS_SOURCES = {
    # --- Yahoo Finance (markets + business) ---
    "yf_top": "https://finance.yahoo.com/news/rssindex",
    "yf_markets": "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US",
    "yahoo_tech": "https://news.yahoo.com/rss/tech",

    # --- MarketWatch ---
    "marketwatch_top": "https://feeds.marketwatch.com/marketwatch/topstories/",

    # --- Wall Street Journal ---
    "wsj_markets": "https://feeds.a.dj.com/rss/RSSMarketsMain",

    # --- CNBC ---
    "cnbc_top": "https://www.cnbc.com/id/100003114/device/rss/rss.html",

    # --- Financial Times ---
    "ft_frontpage": "https://www.ft.com/?format=rss",
}
