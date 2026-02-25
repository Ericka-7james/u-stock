# 📈 U-Stock v2 — Financial Intelligence Platform

🔗 **Live Website**  
https://u-stock-git-main-erickas-projects-e87cef06.vercel.app/

**U-Stock v2** is a modular, cloud-ready financial intelligence platform built to **ingest, validate, snapshot, and analyze market data across multiple timeframes**.  
It serves as a clean foundation for **signal research, analytics dashboards, and future ML-driven trading systems**.

Version 2 marks a **significant architectural upgrade** over v1, introducing snapshot standardization, pipeline health checks, and frontend-aligned data contracts.

---

#### Design principles:

Strategy ≠ execution

Fail safe (never fail loud)

Deterministic behavior

Idempotent persistence

Testability-first defaults


---

# 2) Root `README.md` (updated, repo-wide, includes tmux + correct uvicorn command)

```md
# 📈 U-Stock — Financial Intelligence Platform + Bot Runner

U-Stock is a modular, production-minded market data + automation platform:
- **Backend API** (FastAPI) for market/session utilities, bot status, and integration endpoints
- **Bot runner** (u-stock-bots) that generates intents, executes (paper/live), and persists events
- **Frontend** (Vercel) for dashboards and UX (optional locally)

> Repo is private by design. Secrets live in `.env` files and are not committed.

---

## Repo Layout

- `backend/` — FastAPI backend API (auth + market/session + integrations)
- `u-stock-bots/` — strategy logic + runner (ema_trend, engine, supabase uploader)
- `frontend/` — React/Vite UI (usually deployed to Vercel)
- `supabase/` — Supabase schema/functions (if applicable)

---

## Quick Start (Server / Ubuntu)

### 1) Create venv + install Python deps

```bash
cd ~/USTOCK
python3 -m venv .venv
source .venv/bin/activate

pip install -r backend/requirements.txt
pip install -r u-stock-bots/requirements.txt
```

### 2) Configure environment files (do not commit)

Backend loads:
```bash

backend/.env

backend/.env.local (overrides)
```

Runner typically uses:
```bash

u-stock-bots/.env (sourced into the shell before running)

```

Minimum required:

Supabase URL + keys (as used by backend)

Alpaca keys (if integrations are enabled)

BOT_RUNNER_SECRET (backend) + BOT_RUNNER_SECRET (runner) must match

### Run Backend API

From backend/:
```bash
cd ~/USTOCK
source .venv/bin/activate
cd backend

python -m uvicorn api.index:app --host 0.0.0.0 --port 8000
```

Health check:
```bash
curl -s http://127.0.0.1:8000/health
# {"status":"ok","env":"local"}
```

Local dev (optional hot reload):

```bash
python -m uvicorn api.index:app --reload --host 0.0.0.0 --port 8000
```
### Run Frontend

In a separate terminal:
```bash

cd frontend
npm run dev

```

### Run Bot Runner (u-stock-bots)

In a separate terminal (or tmux window):
```bash
cd ~/USTOCK
source .venv/bin/activate

set -a
source u-stock-bots/.env
set +a

cd u-stock-bots
python -m runner.main

```

Notes:

Runner respects market hours by default

Sunday = market CLOSED is expected

Test mode (ignore market hours):
```bash
python -m runner.main --no-respect-market-hours
```
tmux (recommended for 24/7 runs)
Create / attach
```bash
tmux new -s ustock
# OR
tmux attach -t ustock
```

Useful keys

- New window: Ctrl+B, then C

- Switch windows: Ctrl+B, then 0 / 1 / 2

- Rename window: Ctrl+B, then ,

- List windows: Ctrl+B, then W

- Detach safely: Ctrl+B, then D

Suggested layout:

- Window 0: backend (uvicorn)

- Window 1: runner (python -m runner.main)

Testing

Backend tests:
```bash
cd backend
python -m pytest

```
Runner tests:
```bash
cd u-stock-bots
python -m pytest -c pytest.ini
```
About

Built by Ericka James.

U-Stock is a portfolio-grade system demonstrating:

- backend API design + integrations

- production-friendly bot orchestration

- deterministic logging + idempotent persistence

- deployment readiness (tmux/systemd friendly)


---
