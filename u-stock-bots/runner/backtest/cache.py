from __future__ import annotations

import gzip
import json
import os
from typing import Any, Dict


def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def write_json_gz(path: str, payload: Dict[str, Any]) -> str:
    ensure_dir(os.path.dirname(path))
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(payload, f)
    return path


def read_json_gz(path: str) -> Dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)