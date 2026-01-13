# backend/api/index.py
from __future__ import annotations

# App entrypoint for uvicorn/gunicorn/etc.
# Keeps a stable "api.index:app" import target.
from api.app.app_factory import create_app

app = create_app()
