# U-Stock

**U-Stock** is a personal stock prediction bot that puts you in control of your investment decisions.  
By blending multiple data sources and indicators, U-Stock helps you navigate the market on your own terms.

## Tech Stack

- React + Vite (frontend)
- GitHub Codespaces (cloud dev environment)
- Environment variables via `.env.local` (not committed)

## Features (planned)

- **News Sentiment Analysis** – analyze financial news for positive/negative sentiment.
- **Reddit / Social Sentiment** – scrape discussions around tickers and compute sentiment.
- **Technical Indicators** – moving averages, volume trends, and volatility metrics.
- **Macroeconomic Indicators** – interest rates, inflation, and other macro signals.
- **Political & Regional Sentiment** – factor in political/economic climate and company’s country of origin.

## Getting Started (in Codespaces)

1. Open this repo in a GitHub Codespace.
2. Install dependencies:

   ```bash
   npm install
3. Create .env.local (see example in this README).
4. Run the dev server:
    ```bash 
    npm run dev -- --host 0.0.0.0 --port 5173
5. Open the forwarded port link to view the app.


## Run
npm run fetch:reddit-mentions
npm run dev -- --host 0.0.0.0 --port 5173
