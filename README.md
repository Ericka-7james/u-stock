# 📈 U-Stock – Financial Intelligence Platform

🔗 **Website Link**  
https://u-stock-git-main-erickas-projects-e87cef06.vercel.app/

U-Stock is a financial intelligence platform designed to automate market data ingestion, clean and preprocess stock information, compute multi-signal indicators, and provide structured analytics for future modeling. Built with a modular Python backend and a React frontend, U-Stock makes it easy to explore stock behavior across multiple timeframes.

---

## 🚀 Features

### 📊 Automated Market Data Pipelines
- Symbol universe ingestion and validation  
- Real-time and intraday price fetching  
- Multi-interval data (5m, 15m, daily)  
- Duplicate and anomaly cleaning  
- JSON-based structured outputs  

### ⚙️ Indicator & Analytics Engine
- Multiple technical indicators  
- Intraday + multi-day analysis  
- Extensible architecture for custom indicators  

### 🖥️ React Frontend (TypeScript)
- Clean, modern UI for exploring stock analytics  
- Responsive design  
- Future support for charts + interactive dashboards  

### ☁️ Cloud-Ready Architecture
- Serverless-friendly deployment (Vercel)  
- Modular pipeline organization  
- CI/CD-ready (GitHub Actions planned)  

---

## 🛠 Tech Stack

**Backend**
- Python  
- Pandas  
- YFinance (or similar APIs)  
- JSON-based pipelines  

**Frontend**
- React  
- TypeScript  
- Vite  

**Infrastructure**
- Vercel (hosting)  
- GitHub (source control)  

---

## 🧪 Current Capabilities

- Intraday data ingestion (5m, 15m)  
- Daily historical price collection  
- Cleans delisted + invalid tickers  
- Builds unified, refined symbol universe  
- Outputs analytics-ready JSON files  

---

## 🧱 Planned Improvements

- Docker support  
- CI/CD via GitHub Actions  
- ML-driven signal scoring  
- Portfolio simulation mode  
- Analytics dashboard with charts  
- Performance optimizations  

---

## 🖼 Screenshots

**Dashboard Preview**  
--- coming ---

## 🖼 Pipeline Execution Examples

### 📦 Running Full Fetch Pipeline
This shows U-Stock pulling prices, intraday data, and fundamentals in a single automated batch.

![U-Stock Batch Fetch Pipeline]
<img width="940" height="801" alt="npmrunfetchall" src="https://github.com/user-attachments/assets/631cb2c8-dd04-4764-9d34-28d5b52433ca" />


---

### 📈 Building the Symbol Universe
This screenshot shows the system generating the refined US equities universe using NASDAQ Trader and Wikipedia fallbacks.

![U-Stock Ticker Universe Build]
<img width="1162" height="255" alt="npmruntickers" src="https://github.com/user-attachments/assets/b79564df-1863-4222-a394-79285c0833ca" />

---

## 👩‍💻 About the Developer

Built by **Ericka James** — Software Engineer focusing on full-stack development, data pipelines, and cloud-native systems.

- GitHub: https://github.com/ericka-7james  
- LinkedIn: https://www.linkedin.com/in/ericka-james
