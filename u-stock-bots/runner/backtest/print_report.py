from __future__ import annotations

import argparse
import os
from typing import Any, Dict, List, Tuple

from runner.backtest.cache import read_json_gz


def _fmt_kv(k: str, v: Any) -> str:
    if v is None:
        return f"{k}=None"
    if isinstance(v, (int, float, bool)):
        return f"{k}={v}"
    s = str(v)
    if len(s) > 160:
        s = s[:157] + "..."
    return f"{k}={s}"


def _print_header(title: str) -> None:
    print("\n" + title)
    print("-" * len(title))


def _safe_get(d: Dict[str, Any], path: List[str], default: Any = None) -> Any:
    cur: Any = d
    for p in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(p)
    return cur if cur is not None else default


def _print_top_pairs(pairs: Any, limit: int = 10) -> None:
    if not isinstance(pairs, list):
        print("  (none)")
        return
    for i, item in enumerate(pairs[:limit], 1):
        if isinstance(item, (list, tuple)) and len(item) == 2:
            k, v = item
            print(f"  {i:>2}. {k}: {v}")
        else:
            print(f"  {i:>2}. {item}")


def _print_last_skips(skips: Any) -> None:
    if not isinstance(skips, list) or not skips:
        print("  (none)")
        return

    for s in skips:
        if not isinstance(s, dict):
            continue
        cursor = s.get("cursor")
        stype = s.get("type")
        ok_syms = s.get("ok_syms")
        print(f"\n  cursor={cursor} type={stype} ok_syms={ok_syms}")

        if stype == "prefilter_none":
            sample = s.get("sample") or []
            for row in sample[:3]:
                sym = row.get("symbol")
                reasons = row.get("reasons")
                meta = row.get("meta")
                print(f"    - {sym} reasons={reasons} meta={meta}")
        else:
            dbg = s.get("debug") or []
            for row in dbg[:5]:
                sym = row.get("symbol")
                label = row.get("label")
                reasons = row.get("reasons")
                # show label, and optionally first couple reasons
                if isinstance(reasons, list) and reasons:
                    tail = ", ".join(str(x) for x in reasons[:3])
                    more = "" if len(reasons) <= 3 else f" (+{len(reasons)-3} more)"
                    print(f"    - {sym} {label} reasons=[{tail}{more}]")
                else:
                    print(f"    - {sym} {label}")


def _print_top_intents(intents: Any) -> None:
    if not isinstance(intents, list) or not intents:
        print("  (none)")
        return

    for i, it in enumerate(intents, 1):
        if not isinstance(it, dict):
            continue
        cursor = it.get("cursor")
        sym = it.get("symbol")
        side = it.get("side")
        conf = it.get("confidence")
        bias = it.get("bias_score")
        entry = it.get("entry")
        stop = it.get("stop")
        tp = it.get("take_profit")
        reasons = it.get("reasons") or []
        reasons_s = ", ".join(str(x) for x in reasons[:10])
        if len(reasons) > 10:
            reasons_s += f" (+{len(reasons)-10} more)"
        print(
            f"  {i:>2}. cursor={cursor} {sym} {side} "
            f"conf={conf:.3f} bias={bias:.3f} entry={entry} stop={stop} tp={tp}\n"
            f"      reasons=[{reasons_s}]"
        )


def _print_errors(errors: Any) -> None:
    if not isinstance(errors, list) or not errors:
        print("  (none)")
        return

    for i, e in enumerate(errors, 1):
        if not isinstance(e, dict):
            continue
        cursor = e.get("cursor")
        err = e.get("error")
        tb = e.get("traceback") or ""
        print(f"\n  {i:>2}. cursor={cursor} error={err}")
        print("  traceback:")
        # indent traceback lines
        for line in str(tb).splitlines():
            print(f"    {line}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", required=True, help="Path to .json.gz backtest log")
    ap.add_argument("--top", type=int, default=10, help="How many top debug codes/reasons to show")
    ap.add_argument("--show_skips", action="store_true", help="Print last_skips section")
    ap.add_argument("--show_intents", action="store_true", help="Print top_best_intents section")
    ap.add_argument("--show_errors", action="store_true", help="Print full errors + tracebacks")
    args = ap.parse_args()

    path = str(args.path)
    if not os.path.exists(path):
        raise SystemExit(f"File not found: {path}")

    data = read_json_gz(path)

    meta = _safe_get(data, ["meta"], {}) or {}
    run_args = _safe_get(data, ["args"], {}) or {}
    summary = _safe_get(data, ["summary"], {}) or {}

    _print_header("RUN")
    print(_fmt_kv("run_id", meta.get("run_id")))
    print(_fmt_kv("utc_finished", meta.get("utc_finished")))
    print(_fmt_kv("cmd", meta.get("cmd")))

    _print_header("ARGS")
    # show core args compactly
    core_keys = ["symbols", "tf_entry", "tf_bias", "start", "end", "feed", "qty", "warmup", "steps", "max_intents_per_tick"]
    for k in core_keys:
        print(_fmt_kv(k, run_args.get(k)))

    overrides = run_args.get("overrides") or {}
    if isinstance(overrides, dict):
        print(_fmt_kv("overrides", overrides))

    _print_header("SUMMARY")
    print(_fmt_kv("ticks", summary.get("ticks")))
    print(_fmt_kv("ticks_with_intent", summary.get("ticks_with_intent")))
    print(_fmt_kv("ticks_with_intent_pct", summary.get("ticks_with_intent_pct")))
    print(_fmt_kv("errors_n", summary.get("errors_n")))

    print("\nBest by symbol:")
    print(" ", summary.get("best_by_symbol"))

    conf = summary.get("confidence") or {}
    bs = summary.get("bias_score") or {}
    if isinstance(conf, dict):
        print("\nConfidence:", conf)
    if isinstance(bs, dict):
        print("Bias score:", bs)

    _print_header("TOP DEBUG CODES")
    _print_top_pairs(summary.get("top_debug_codes"), limit=int(args.top))

    _print_header("TOP SIGNAL REASONS")
    _print_top_pairs(summary.get("top_signal_reasons"), limit=int(args.top))

    if args.show_skips:
        _print_header("LAST SKIPS")
        _print_last_skips(data.get("last_skips"))

    if args.show_intents:
        _print_header("TOP BEST INTENTS")
        _print_top_intents(data.get("top_best_intents"))

    if args.show_errors:
        _print_header("ERRORS")
        _print_errors(data.get("errors"))


if __name__ == "__main__":
    main()