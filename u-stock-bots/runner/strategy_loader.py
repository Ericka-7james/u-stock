# u-stock-bots/runner/strategy_loader.py
from __future__ import annotations

import importlib
from typing import Any, Dict

from bots._shared.ustock_http import UStockAPI

from runner.events import coerce_intents_list, make_event, now_iso


def load_bot_module(bot_id: str):
    """
    BOT_ID=ema_trend -> imports bots.ema_trend.bot
    BOT_ID=orb       -> imports bots.orb.bot
    """
    mod_name = f"bots.{bot_id}.bot"
    return importlib.import_module(mod_name)


def compute_bot_output(api: UStockAPI, bot_id: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Supports these bot interfaces:
      1) generate_output(api=..., config=...) -> {"intents": [...], "events": [...]}
      2) generate_intents(api=..., config=...) -> [...]
      3) run(api=..., cfg=<dataclass or dict>) -> [...]
    Returns:
      {"intents": list[dict], "events": list[dict]}
    """
    try:
        bot_mod = load_bot_module(bot_id)
    except Exception as e:
        return {
            "intents": [],
            "events": [
                make_event(
                    ts=now_iso(),
                    event_type="runner_bot_load_failed",
                    level="error",
                    symbol=None,
                    payload={"bot_id": bot_id, "error": repr(e)},
                )
            ],
        }

    gen_out = getattr(bot_mod, "generate_output", None)
    if callable(gen_out):
        try:
            out = gen_out(api=api, config=cfg)
            if isinstance(out, dict):
                intents = coerce_intents_list(out.get("intents"))
                events = out.get("events") or []
                return {
                    "intents": intents,
                    "events": events if isinstance(events, list) else [],
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
                        payload={"bot_id": bot_id, "error": repr(e)},
                    )
                ],
            }

    gen_intents = getattr(bot_mod, "generate_intents", None)
    if callable(gen_intents):
        try:
            intents = coerce_intents_list(gen_intents(api=api, config=cfg))
            return {"intents": intents, "events": []}
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    make_event(
                        ts=now_iso(),
                        event_type="runner_bot_generate_intents_failed",
                        level="error",
                        symbol=None,
                        payload={"bot_id": bot_id, "error": repr(e)},
                    )
                ],
            }

    run_fn = getattr(bot_mod, "run", None)
    if callable(run_fn):
        try:
            intents = coerce_intents_list(run_fn(api=api, cfg=cfg))
            return {"intents": intents, "events": []}
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    make_event(
                        ts=now_iso(),
                        event_type="runner_bot_run_failed",
                        level="error",
                        symbol=None,
                        payload={"bot_id": bot_id, "error": repr(e)},
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
                payload={"bot_id": bot_id, "expected": ["generate_output", "generate_intents", "run"]},
            )
        ],
    }
