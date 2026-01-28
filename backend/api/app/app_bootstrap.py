from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def bootstrap_paths() -> Path:
    """
    Ensure backend/ is on sys.path for 'api.*' imports in certain run modes.
    Returns backend dir.
    """
    this_file = Path(__file__).resolve()  # backend/api/app/app_bootstrap.py
    api_dir = this_file.parents[1]        # backend/api
    backend_dir = api_dir.parent          # backend

    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    return backend_dir


def load_env(backend_dir: Path) -> str:
    """
    Load .env then .env.local, with this rule:
      - OS / pytest env ALWAYS wins
      - .env.local overrides .env (but not OS env)

    Returns ENV lowercased.
    """
    original_env = dict(os.environ)

    load_dotenv(backend_dir / ".env", override=False)
    load_dotenv(backend_dir / ".env.local", override=True)

    # Restore any variables that already existed in the OS environment
    for k, v in original_env.items():
        os.environ[k] = v

    return os.getenv("ENV", "local").strip().lower()
