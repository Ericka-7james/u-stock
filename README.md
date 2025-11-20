# U-Stock — Personal Data-Driven Market Radar

**U-Stock** is a personal market-intelligence bot that blends multiple **free APIs**, **Reddit sentiment**, **price data**, **fundamentals**, and **macro indicators** into a unified snapshot.  
Your React frontend displays the radar; your Python backend (“Data Scout Bot”) collects raw data snapshots.

---

## 🚀 Tech Stack

### **Frontend**
- React + Vite  
- Recharts (visualizations)  
- Custom UI components (Sidebar, Topbar, Footer)  
- Config-driven data sources (`src/config/`)

### **Backend / Data Scout**
- Python 3  
- `yfinance` (prices + fundamentals)  
- Official **Reddit API via OAuth**  
- **FRED** API for macro  
- Outputs JSON snapshots to `public/data/*.json`  
- Modular pipeline:
  - `prices.py`
  - `reddit.py`
  - `fundamentals.py`
  - `macro.py`
  - `run_all.py`

### **Dev Environment**
- GitHub Codespaces  
- Uses `.env.local` for credentials  
- Works with Node & Python side-by-side

---

## 🔐 Environment Variables (`.env.local`)

Create a file at the **root** of the project:

    VITE_REDDIT_CLIENT_ID=xxxx
    VITE_REDDIT_SECRET=xxxx
    VITE_REDDIT_USERNAME=yourbot
    VITE_REDDIT_PASSWORD= yourpassword
    VITE_REDDIT_USER_AGENT=win:QuantaTrail/0.1
    FRED API= yourfredapi

---

## ▶️ Running the Frontend

Install dependencies:

```bash
npm install
```

### Run dev server:
```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

### OR simply:
```bash
npm run dev
```

---

## 🐍 Running the Data Scout Pipeline (Python)

### Set your PYTHONPATH:
```bash
export PYTHONPATH=src:$PYTHONPATH
```

### Run full pipeline
```bash
PYTHONPATH=src python -m data_scout.run_all
```

### You’ll see:
- `▶ Prices`
- `▶ Reddit Mentions`
- `▶ Fundamentals`
- `▶ Macro`
- `📊 Final Summary`

---

## Testing

✅ **Frontend tests**

- `npm run test` – run Vitest in Node
- `npm run test:ui` – open the Vitest browser dashboard

✅ **Backend tests**

- `npm run test:backend` – run Python tests with pytest

✅ **Run everything**

- `npm run test:all` – runs frontend tests (Vitest) and then backend tests (pytest)

✅ **Ensure your Reddit credentials work**

- `npm run test:reddit-auth` – runs frontend tests (Vitest) and then backend tests (pytest)

---