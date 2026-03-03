from __future__ import annotations

import os
import argparse
import traceback
import subprocess
from typing import Any, Dict, List, Optional, Tuple

from collections import Counter, deque
from datetime import datetime, timezone

# ✅ Load environment variables from u-stock-bots/.env.local
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv()  # optional: also load .env if present

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ENV_PATH = os.path.join(PROJECT_ROOT, ".env.local")
load_dotenv(ENV_PATH)

from bots.ema_trend.bot import compute as ema_compute
from runner.backtest.backtest_api import BacktestAPI, BacktestSpec
from runner.backtest.prefilter import PrefilterConfig, prefilter_universe
from runner.backtest.selection import SelectionConfig, pick_best_intent
from runner.backtest.cache import write_json_gz


def _split_csv(s: str) -> List[str]:
    out: List[str] = []
    for x in (s or "").split(","):
        t = x.strip().upper()
        if t:
            out.append(t)
    return out


def _as_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return float(default)


def _rank_intent(it: Dict[str, Any]) -> Tuple[float, float]:
    # primary: confidence, secondary: bias_score
    return (_as_float(it.get("confidence"), 0.0), _as_float(it.get("bias_score"), 0.0))


def _safe_slug(s: str) -> str:
    s = str(s or "").strip()
    out: List[str] = []
    for ch in s:
        if ch.isalnum() or ch in ("-", "_", "."):
            out.append(ch)
        elif ch in (" ", ",", ":", "/", "\\"):
            out.append("_")
        # drop everything else
    slug = "".join(out).strip("_")
    return slug or "run"


def _ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def _write_text(path: str, text: str) -> None:
    _ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def _score(it: Dict[str, Any]) -> float:
    conf = float(it.get("confidence") or 0.0)
    bias = float(it.get("bias_score") or 0.0)
    # weight confidence more, but require bias to matter
    return (0.70 * conf) + (0.30 * bias)


def _confidence_breakdown(confs: List[float]) -> Dict[str, int]:
    buckets = {
        "0.50-0.60": 0,
        "0.60-0.70": 0,
        "0.70-0.80": 0,
        "0.80+": 0,
    }
    for c in confs:
        if c < 0.50:
            continue
        if c < 0.60:
            buckets["0.50-0.60"] += 1
        elif c < 0.70:
            buckets["0.60-0.70"] += 1
        elif c < 0.80:
            buckets["0.70-0.80"] += 1
        else:
            buckets["0.80+"] += 1
    return buckets


def _run_print_report_to_file(
    *,
    log_path: str,
    out_txt_path: str,
    top: int,
    show_skips: bool,
    show_intents: bool,
    show_errors: bool,
) -> None:
    cmd: List[str] = [
        os.sys.executable,
        "-m",
        "runner.backtest.print_report",
        "--path",
        str(log_path),
        "--top",
        str(int(top)),
    ]
    if show_skips:
        cmd.append("--show_skips")
    if show_intents:
        cmd.append("--show_intents")
    if show_errors:
        cmd.append("--show_errors")

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        combined = ""
        if res.stdout:
            combined += res.stdout
        if res.stderr:
            if combined and not combined.endswith("\n"):
                combined += "\n"
            combined += "\n[stderr]\n"
            combined += res.stderr
        if not combined:
            combined = "(print_report produced no output)\n"
        _write_text(out_txt_path, combined)
    except Exception as e:
        _write_text(out_txt_path, f"(failed to run print_report) error={repr(e)}\n")


class _RoutingBacktestAPI:
    def __init__(self, *, apis_entry: Dict[str, BacktestAPI], apis_bias: Dict[str, BacktestAPI]) -> None:
        self.apis_entry = apis_entry
        self.apis_bias = apis_bias

    def get_bars(
        self, *, symbol: str, tf: str, limit: int = 200, feed: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        sym = str(symbol or "").strip().upper()
        tf_s = str(tf or "").strip()

        if sym in self.apis_entry and tf_s == str(self.apis_entry[sym].spec.tf):
            return self.apis_entry[sym].get_bars(symbol=sym, tf=tf_s, limit=limit, feed=feed)

        if sym in self.apis_bias and tf_s == str(self.apis_bias[sym].spec.tf):
            return self.apis_bias[sym].get_bars(symbol=sym, tf=tf_s, limit=limit, feed=feed)

        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", required=True, help="Comma-separated universe, e.g. SPY,QQQ,AAPL,MSFT,NVDA")
    ap.add_argument("--tf_bias", default="15Min")
    ap.add_argument("--tf_entry", default="1Min")
    ap.add_argument("--start", required=True, help="YYYY-MM-DD or ISO")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD or ISO")
    ap.add_argument("--feed", default=None)

    ap.add_argument("--qty", type=int, default=1)
    ap.add_argument("--warmup", type=int, default=320, help="Bars warmup before first decision (entry tf bars)")
    ap.add_argument("--steps", type=int, default=300, help="How many ticks to run after warmup")
    ap.add_argument("--max_intents_per_tick", type=int, default=1)

    # Prefilter knobs
    ap.add_argument("--pf_min_bias", type=int, default=80)
    ap.add_argument("--pf_min_entry", type=int, default=120)

    # Strategy overrides (ONLY apply when explicitly provided)
    ap.add_argument("--min_atr_pct", type=float, default=None, help="Override EMATrendConfig.min_atr_pct (percent)")
    ap.add_argument("--atr_n", type=int, default=None, help="Override EMATrendConfig.atr_n")
    ap.add_argument("--min_confidence", type=float, default=None, help="Override EMATrendConfig.min_confidence")
    ap.add_argument("--require_confirm_candle", type=int, default=None, help="Override require_confirm_candle (1/0)")

    # Output folder behavior
    ap.add_argument("--run_name", default=None, help="Optional label appended to run folder name")
    ap.add_argument("--tail", type=int, default=10, help="Print only the last N tick lines at the end")
    ap.add_argument("--verbose", action="store_true", help="Print per-tick lines while running (normally off)")

    # Log shaping
    ap.add_argument("--log_keep_skips", type=int, default=10, help="Keep last N skip samples in log")
    ap.add_argument("--log_top_intents", type=int, default=10, help="Keep top N best intents in log")

    # Report writing
    ap.add_argument("--report_top", type=int, default=10)
    ap.add_argument("--report_skips", action="store_true")
    ap.add_argument("--report_intents", action="store_true")
    ap.add_argument("--report_errors", action="store_true")

    args = ap.parse_args()

    universe = _split_csv(args.symbols)
    if not universe:
        raise SystemExit("No symbols provided.")

    # -----------------------------
    # Run folder under repo root
    # -----------------------------
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    sym_tag = _safe_slug("-".join(universe[:3]))
    tf_tag = _safe_slug(f"{args.tf_bias}_{args.tf_entry}")
    extra = _safe_slug(args.run_name) if args.run_name else ""
    folder_name = f"{ts}_ema_scan_{sym_tag}_{tf_tag}"
    if extra:
        folder_name += f"_{extra}"

    run_dir = os.path.join(".cache", "backtests", folder_name)
    _ensure_dir(run_dir)

    log_path = os.path.join(run_dir, "run.json.gz")
    report_path = os.path.join(run_dir, "report.txt")

    # Start banner (always)
    print(f"run_dir: {run_dir}")
    print(f"log_path: {log_path}")
    print(f"report_path: {report_path}")
    print(f"universe: {universe}")
    print(f"tf_entry={args.tf_entry} tf_bias={args.tf_bias} start={args.start} end={args.end} feed={args.feed}")

    # -----------------------------
    # Build APIs
    # -----------------------------
    apis_entry: Dict[str, BacktestAPI] = {}
    apis_bias: Dict[str, BacktestAPI] = {}

    for sym in universe:
        spec_entry = BacktestSpec(
            provider="alpaca",
            symbol=sym,
            tf=str(args.tf_entry),
            start=str(args.start),
            end=str(args.end),
            feed=args.feed,
        )
        apis_entry[sym] = BacktestAPI(spec=spec_entry, cache_root=".cache/bars")

        spec_bias = BacktestSpec(
            provider="alpaca",
            symbol=sym,
            tf=str(args.tf_bias),
            start=str(args.start),
            end=str(args.end),
            feed=args.feed,
        )
        apis_bias[sym] = BacktestAPI(spec=spec_bias, cache_root=".cache/bars")

    max_idx_entry = min(api.max_index() for api in apis_entry.values())
    max_idx_bias = min(api.max_index() for api in apis_bias.values())
    max_idx = min(max_idx_entry, max_idx_bias)

    warmup = max(2, int(args.warmup))
    start_cursor = warmup - 1
    if start_cursor > max_idx:
        raise SystemExit(f"Warmup too large. start_cursor={start_cursor} but max_idx={max_idx}")

    end_cursor = min(max_idx, start_cursor + max(0, int(args.steps)))

    pf_cfg = PrefilterConfig(
        min_bars_bias=int(args.pf_min_bias),
        min_bars_entry=int(args.pf_min_entry),
    )
    sel_cfg = SelectionConfig()

    # -----------------------------
    # Collectors
    # -----------------------------
    tick_count = 0
    ticks_with_intent = 0
    best_by_symbol = Counter()
    debug_code_counts = Counter()
    reason_counts = Counter()
    conf_list: List[float] = []
    bias_score_list: List[float] = []

    keep_skips = max(0, int(args.log_keep_skips))
    last_skip_samples: deque[Dict[str, Any]] = deque(maxlen=(keep_skips if keep_skips > 0 else 1))
    best_intents_all: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    # terminal tail
    tail_n = max(0, int(args.tail))
    tail_lines: deque[str] = deque(maxlen=(tail_n if tail_n > 0 else 1))

    api = _RoutingBacktestAPI(apis_entry=apis_entry, apis_bias=apis_bias)

    for cursor in range(start_cursor, end_cursor + 1):
        tick_count += 1

        try:
            for sym in universe:
                apis_entry[sym].set_cursor(cursor)
                apis_bias[sym].set_cursor(cursor)

            bias_by_symbol: Dict[str, Optional[Dict[str, Any]]] = {}
            entry_by_symbol: Dict[str, Optional[Dict[str, Any]]] = {}

            for sym in universe:
                bias_by_symbol[sym] = apis_bias[sym].get_bars(
                    symbol=sym, tf=args.tf_bias, limit=220, feed=args.feed
                )
                entry_by_symbol[sym] = apis_entry[sym].get_bars(
                    symbol=sym, tf=args.tf_entry, limit=300, feed=args.feed
                )

            ok_syms, pf_decisions = prefilter_universe(
                symbols=universe,
                bias_by_symbol=bias_by_symbol,
                entry_by_symbol=entry_by_symbol,
                cfg=pf_cfg,
            )

            if not ok_syms:
                msg = f"[{cursor}] prefilter: no symbols passed"
                tail_lines.append(msg)
                if args.verbose:
                    print(msg)

                if keep_skips > 0:
                    sample_pf = pf_decisions[:3]
                    last_skip_samples.append(
                        {
                            "cursor": cursor,
                            "type": "prefilter_none",
                            "ok_syms": 0,
                            "sample": [
                                {"symbol": d.symbol, "reasons": d.reasons, "meta": d.meta} for d in sample_pf
                            ],
                        }
                    )
                continue

            # Baseline: rely on EMATrendConfig defaults unless overridden
            cfg_dict: Dict[str, Any] = {
                "bot_id": "ema_trend",
                "qty": int(args.qty),
                "tf_bias": str(args.tf_bias),
                "tf_entry": str(args.tf_entry),
                "max_intents_per_run": int(args.max_intents_per_tick),
                "scanner": {"symbols": ok_syms},
            }

            # Optional overrides (ONLY when explicitly passed)
            if args.min_atr_pct is not None:
                cfg_dict["min_atr_pct"] = float(args.min_atr_pct)
            if args.atr_n is not None:
                cfg_dict["atr_n"] = int(args.atr_n)
            if args.min_confidence is not None:
                cfg_dict["min_confidence"] = float(args.min_confidence)
            if args.require_confirm_candle is not None:
                cfg_dict["require_confirm_candle"] = bool(int(args.require_confirm_candle))

            out = ema_compute(api=api, bot_id="ema_trend", cfg_dict=cfg_dict)
            intents = out.get("intents") or []
            events = out.get("events") or []

            best = pick_best_intent(intents, sel_cfg)

            # Count debug codes (even when no intent)
            for e in events:
                if isinstance(e, dict) and e.get("event_type") == "strategy_debug":
                    p = e.get("payload") or {}
                    code = str(p.get("code") or "")
                    if code:
                        debug_code_counts[code] += 1

            if best:
                ticks_with_intent += 1
                sym = str(best.get("symbol") or "?")
                side = str(best.get("side") or "?")
                conf = float(best.get("confidence") or 0.0)
                bias_score = float(best.get("bias_score") or 0.0)

                conf_list.append(conf)
                bias_score_list.append(bias_score)
                best_by_symbol[sym] += 1

                for r in (best.get("reasons") or []):
                    reason_counts[str(r)] += 1

                best_intents_all.append(
                    {
                        "cursor": cursor,
                        "symbol": sym,
                        "side": side,
                        "confidence": conf,
                        "bias_score": bias_score,
                        "entry": best.get("entry"),
                        "stop": best.get("stop"),
                        "take_profit": best.get("take_profit"),
                        "reasons": best.get("reasons") or [],
                    }
                )

                msg = f"[{cursor}] BEST {sym} {side} conf={conf:.3f} bias={bias_score:.3f}"
                tail_lines.append(msg)
                if args.verbose:
                    print(msg)
            else:
                msg = f"[{cursor}] no intent (ok_syms={len(ok_syms)})"
                tail_lines.append(msg)
                if args.verbose:
                    print(msg)

                if keep_skips > 0:
                    dbg = [e for e in events if isinstance(e, dict) and e.get("event_type") == "strategy_debug"]
                    sample = []
                    for e in dbg[:3]:
                        p = e.get("payload") or {}
                        code = str(p.get("code") or "")
                        reasons = p.get("reasons") or []
                        r0 = reasons[0] if isinstance(reasons, list) and reasons else None
                        rn = len(reasons) if isinstance(reasons, list) else 0
                        label = f"{code}:{r0} (n={rn})" if r0 else f"{code} (n={rn})"
                        sample.append({"symbol": e.get("symbol"), "label": label, "reasons": reasons})
                    last_skip_samples.append(
                        {"cursor": cursor, "type": "no_intent", "ok_syms": len(ok_syms), "debug": sample}
                    )

        except Exception as e:
            err = {
                "cursor": cursor,
                "error": repr(e),
                "traceback": traceback.format_exc(),
            }
            errors.append(err)

            msg = f"[{cursor}] ERROR {repr(e)}"
            tail_lines.append(msg)
            if args.verbose:
                print(msg)

    # -----------------------------
    # Summary + log payload
    # -----------------------------
    pct = (ticks_with_intent / max(1, tick_count)) * 100.0
    top_n = max(0, int(args.log_top_intents))
    top_best_intents = sorted(best_intents_all, key=lambda it: _rank_intent(it), reverse=True)[:top_n]

    conf_avg = (sum(conf_list) / len(conf_list)) if conf_list else 0.0
    conf_median = (sorted(conf_list)[len(conf_list) // 2]) if conf_list else 0.0
    bs_avg = (sum(bias_score_list) / len(bias_score_list)) if bias_score_list else 0.0
    bs_median = (sorted(bias_score_list)[len(bias_score_list) // 2]) if bias_score_list else 0.0

    conf_bd = _confidence_breakdown(conf_list)

    summary = {
        "ticks": tick_count,
        "ticks_with_intent": ticks_with_intent,
        "ticks_with_intent_pct": round(pct, 4),
        "best_by_symbol": dict(best_by_symbol),
        "top_debug_codes": debug_code_counts.most_common(25),
        "top_signal_reasons": reason_counts.most_common(25),
        "confidence": {"avg": round(conf_avg, 6), "median": round(conf_median, 6), "n": len(conf_list)},
        "confidence_breakdown": conf_bd,
        "bias_score": {"avg": round(bs_avg, 6), "median": round(bs_median, 6), "n": len(bias_score_list)},
        "errors_n": len(errors),
    }

    payload = {
        "meta": {
            "run_id": os.path.basename(run_dir),
            "utc_finished": datetime.now(timezone.utc).isoformat(),
            "cmd": "run_ema_scan_backtest",
            "run_dir": run_dir,
            "log_path": log_path,
            "report_path": report_path,
        },
        "args": {
            "symbols": universe,
            "tf_entry": str(args.tf_entry),
            "tf_bias": str(args.tf_bias),
            "start": str(args.start),
            "end": str(args.end),
            "feed": args.feed,
            "qty": int(args.qty),
            "warmup": int(args.warmup),
            "steps": int(args.steps),
            "max_intents_per_tick": int(args.max_intents_per_tick),
            "pf_min_bias": int(args.pf_min_bias),
            "pf_min_entry": int(args.pf_min_entry),
            "overrides": {
                "min_atr_pct": args.min_atr_pct,
                "atr_n": args.atr_n,
                "min_confidence": args.min_confidence,
                "require_confirm_candle": args.require_confirm_candle,
            },
            "log_keep_skips": int(args.log_keep_skips),
            "log_top_intents": int(args.log_top_intents),
        },
        "summary": summary,
        "last_skips": list(last_skip_samples) if keep_skips > 0 else [],
        "top_best_intents": top_best_intents,
        "errors": errors,
    }

    out_path = write_json_gz(log_path, payload)

    # Always write report.txt (uses your existing print_report module)
    _run_print_report_to_file(
        log_path=out_path,
        out_txt_path=report_path,
        top=int(args.report_top),
        show_skips=bool(args.report_skips),
        show_intents=bool(args.report_intents),
        show_errors=bool(args.report_errors),
    )

    # -----------------------------
    # Terminal output: last N lines + top intents + summary
    # -----------------------------
    print("\n(last lines)")
    for line in list(tail_lines):
        print(line)

    # One combined "top 5" block (no duplicates)
    top_5_terminal = sorted(best_intents_all, key=_score, reverse=True)[:5]
    print("\n(top 5 best intents)")
    if not top_5_terminal:
        print("  (none)")
    else:
        for it in top_5_terminal:
            reasons = it.get("reasons") or []
            rs = ", ".join(str(x) for x in reasons[:6])
            if len(reasons) > 6:
                rs += f" (+{len(reasons)-6})"
            print(
                f"[{it['cursor']}] BEST {it['symbol']} {it['side']} "
                f"conf={it['confidence']:.3f} bias={it['bias_score']:.3f} "
                f"score={_score(it):.3f}"
            )
            print(f"      reasons=[{rs}]")

    print("\n=== SUMMARY ===")
    print(f"ticks: {tick_count}")
    print(f"ticks_with_intent: {ticks_with_intent} ({pct:.2f}%)")
    print(f"best_by_symbol: {best_by_symbol}")
    print(f"errors: {len(errors)}")
    print(f"log_written: {out_path}")
    print(f"report_written: {report_path}")

    print("\nConfidence breakdown (counts)")
    print(f"  0.50-0.60: {conf_bd['0.50-0.60']}")
    print(f"  0.60-0.70: {conf_bd['0.60-0.70']}")
    print(f"  0.70-0.80: {conf_bd['0.70-0.80']}")
    print(f"  0.80+:     {conf_bd['0.80+']}")


if __name__ == "__main__":
    main()