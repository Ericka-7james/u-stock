# src/data_scout/tests/conftest.py
import sys
from pathlib import Path

# This file lives in: <repo>/src/data_scout/tests/conftest.py
# We want: <repo>/src on sys.path so `import data_scout` works.

SRC_PATH = Path(__file__).resolve().parents[2]  # .../src
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))
