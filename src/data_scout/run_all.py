"""
data_scout/run_all.py

Master command to run ALL u-Stock data ingestion modules:

    • prices.py        – price snapshots
    • reddit.py        – ticker mentions from Reddit
    • fundamentals.py  – company fundamentals
    • macro.py         – macroeconomic indicators

----------------------------------------------
Command:
    python -m data_scout.run_all
----------------------------------------------

What it does:
    - Runs each module in sequence.
    - Logs success/failure for each one.
    - Never stops on error — continues all steps.
    - Prints a final summary of everything run.
"""

from __future__ import annotations
import subprocess
import sys
from pathlib import Path

# Root directory for info
ROOT = Path(__file__).resolve().parents[2]


def run_step(title: str, module: str) -> bool:
    """
    Run a module with:
        python -m data_scout.<module>

    Returns True on success, False on failure.
    """
    print("\n" + "=" * 70)
    print(f"▶ {title}")
    print("=" * 70)

    try:
        completed = subprocess.run(
            [sys.executable, "-m", f"data_scout.{module}"],
            check=False,
            capture_output=True,
            text=True,
        )

        # Echo output nicely formatted
        if completed.stdout.strip():
            print("STDOUT:")
            print(completed.stdout)

        if completed.stderr.strip():
            print("STDERR:")
            print(completed.stderr)

        if completed.returncode == 0:
            print(f"✓ SUCCESS: {title}")
            return True
        else:
            print(f"✗ FAILED (exit {completed.returncode}): {title}")
            return False

    except Exception as exc:  # noqa: BLE001
        print(f"✗ ERROR running {title}: {exc}")
        return False


def main() -> None:
    print("\n==============================================================")
    print("🚀  Running FULL U-STOCK Data Scout Pipeline")
    print("==============================================================\n")

    results = {
        "prices": run_step("Prices Snapshot", "prices"),
        "reddit": run_step("Reddit Mentions Snapshot", "reddit"),
        "fundamentals": run_step("Fundamentals Snapshot", "fundamentals"),
        "macro": run_step("Macro Snapshot", "macro"),
    }

    print("\n==============================================================")
    print("📊 Final Summary")
    print("==============================================================")

    for key, success in results.items():
        print(f"{key:<15} : {'✓ OK' if success else '✗ FAILED'}")

    print("\nOutput directory:")
    print(f"   {ROOT}/public/data\n")

    print("Done.\n")


if __name__ == "__main__":
    main()
