# src/config/reddit_sources.py

"""
Central place to configure all Reddit communities that
Data Scout should scan.

The backend still has a small DEFAULT_SUBREDDITS list for tests
and CLI defaults; this file lets you scale up to a *much* larger
universe without touching core logic.
"""

REDDIT_COMMUNITIES = [
    # Core stock & investing
    "stocks",
    "investing",
    "StockMarket",
    "wallstreetbets",
    "options",
    "Daytrading",
    "pennystocks",
    "RobinHood",
    "personalfinance",
    "financialindependence",

    # Long-term, Boglehead-ish
    "Bogleheads",
    "ETFs",
    "indexfunds",

    # Company / sector focused
    "TechStocks",
    "EVStocks",
    "dividends",
    "growthstocks",
    "valueinvesting",
    "BiotechStocks",
    "RealEstate",
    "REITs",

    # Macro & economics
    "Economics",
    "macroeconomics",
    "finance",

    # Crypto (for cross-signal / risk-on sentiment)
    "CryptoCurrency",
    "CryptoMarkets",
    "Bitcoin",
    "ethereum",

    # Quant / data / algo
    "algotrading",
    "quantfinance",
    "quant",
    "MachineLearning",
    "DataScience",

    # Country-specific markets
    "CanadianInvestor",
    "eupersonalfinance",
    "UKInvesting",

    # Meme / high volatility spaces
    "SPACs",
    "GME",
    "Superstonk",
    "wallstreetbetsELITE",
]
