from __future__ import annotations

from pathlib import Path


def get_project_root() -> Path:
    # src/data_scout/utils/paths.py -> parents[3] == project root
    return Path(__file__).resolve().parents[3]


def data_fetched_dir() -> Path:
    root = get_project_root()
    path = root / "public" / "data" / "fetched"
    path.mkdir(parents=True, exist_ok=True)
    return path


def data_pandas_dir() -> Path:
    root = get_project_root()
    path = root / "public" / "data" / "pandas"
    path.mkdir(parents=True, exist_ok=True)
    return path
