# u-stock-bots/runner/strategy_loader.py
from __future__ import annotations

import importlib
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from bots._shared.ustock_http import UStockAPI

from runner.events import coerce_intents_list, make_event, now_iso

_BOT_ID_RE = re.compile(r"^[a-z0-9_]+$")


def _safe_bot_id(bot_id: str) -> str:
    bid = str(bot_id or "").strip().lower()
    if not bid or not _BOT_ID_RE.match(bid):
        # do not raise; upstream expects fail-soft behavior
        return ""
    return bid


def load_bot_module(bot_id: str):
    """
    BOT_ID=ema_trend -> imports bots.ema_trend.bot
    BOT_ID=orb       -> imports bots.orb.bot
    """
    bid = _safe_bot_id(bot_id)
    if not bid:
        raise ValueError("invalid bot_id")
    mod_name = f"bots.{bid}.bot"
    return importlib.import_module(mod_name)


def _as_list_of_dicts(x: Any) -> List[Dict[str, Any]]:
    if not isinstance(x, list):
        return []
    return [it for it in x if isinstance(it, dict)]


def _call_strategy_fn(fn: Callable[..., Any], *, api: UStockAPI, cfg: Dict[str, Any]) -> Any:
    """
    Call strategy entrypoints with flexible signatures.
    Tries common parameter names and finally positional.
    """
    # Preferred names first
    try:
        return fn(api=api, config=cfg)
    except TypeError:
        pass
    try:
        return fn(api=api, cfg=cfg)
    except TypeError:
        pass
    # Positional fallback (api, cfg)
    return fn(api, cfg)


def compute_bot_output(api: UStockAPI, bot_id: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Supports these bot interfaces:
      1) generate_output(api=..., config/cfg=...) -> {"intents": [...], "events": [...]}
      2) generate_intents(api=..., config/cfg=...) -> [...]
      3) run(api=..., config/cfg=...) -> [...]
    Returns:
      {"intents": list[dict], "events": list[dict]}
    """
    bid = _safe_bot_id(bot_id)

    if not bid:
        return {
            "intents": [],
            "events": [
                make_event(
                    ts=now_iso(),
                    event_type="runner_bot_load_failed",
                    level="error",
                    symbol=None,
                    payload={"bot_id": str(bot_id or ""), "error": "invalid bot_id"},
                )
            ],
        }

    try:
        bot_mod = load_bot_module(bid)
    except Exception as e:
        return {
            "intents": [],
            "events": [
                make_event(
                    ts=now_iso(),
                    event_type="runner_bot_load_failed",
                    level="error",
                    symbol=None,
                    payload={"bot_id": bid, "error": repr(e)},
                )
            ],
        }

    # 1) generate_output
    gen_out = getattr(bot_mod, "generate_output", None)
    if callable(gen_out):
        try:
            out = _call_strategy_fn(gen_out, api=api, cfg=cfg)
            if isinstance(out, dict):
                intents = coerce_intents_list(out.get("intents"))
                events = _as_list_of_dicts(out.get("events"))
                return {
                    "intents": intents,
                    "events": events,
                    "meta": {"bot_id": bid, "entrypoint": "generate_output"},
                }
            # Bad shape: treat as failure but don't crash
            return {
                "intents": [],
                "events": [
                    make_event(
                        ts=now_iso(),
                        event_type="runner_bot_generate_output_failed",
                        level="error",
                        symbol=None,
                        payload={"bot_id": bid, "error": "generate_output returned non-dict"},
                    )
                ],
            }
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    make_event(
                        ts=now_iso(),
                        event_type="runner_bot_generate_output_failed",
                        level="error",
                        symbol=None,
                        payload={"bot_id": bid, "error": repr(e)},
                    )
                ],
            }

    # 2) generate_intents
    gen_intents = getattr(bot_mod, "generate_intents", None)
    if callable(gen_intents):
        try:
            intents = coerce_intents_list(_call_strategy_fn(gen_intents, api=api, cfg=cfg))
            return {"intents": intents, "events": [], "meta": {"bot_id": bid, "entrypoint": "generate_intents"}}
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    make_event(
                        ts=now_iso(),
                        event_type="runner_bot_generate_intents_failed",
                        level="error",
                        symbol=None,
                        payload={"bot_id": bid, "error": repr(e)},
                    )
                ],
            }

    # 3) run
    run_fn = getattr(bot_mod, "run", None)
    if callable(run_fn):
        try:
            intents = coerce_intents_list(_call_strategy_fn(run_fn, api=api, cfg=cfg))
            return {"intents": intents, "events": [], "meta": {"bot_id": bid, "entrypoint": "run"}}
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    make_event(
                        ts=now_iso(),
                        event_type="runner_bot_run_failed",
                        level="error",
                        symbol=None,
                        payload={"bot_id": bid, "error": repr(e)},
                    )
                ],
            }

    return {
        "intents": [],
        "events": [
            make_event(
                ts=now_iso(),
                event_type="runner_bot_no_entrypoint",
                level="error",
                symbol=None,
                payload={"bot_id": bid, "expected": ["generate_output", "generate_intents", "run"]},
            )
        ],
    }