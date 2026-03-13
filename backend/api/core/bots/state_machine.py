from __future__ import annotations

"""State normalization and effective-state computation for bots."""

from typing import Any, Optional

from api.core.bots.time_utils import now_epoch
from api.core.bots.validators import parse_ts_to_epoch_seconds


def normalize_desired_state(value: Any) -> str:
    """Normalizes control-plane desired state values.

    Canonical desired states:
    - running
    - stopped
    """
    normalized = str(value or "").strip().lower()

    if normalized in {"running", "run", "start", "started", "on"}:
        return "running"

    if normalized in {
        "stopped",
        "stop",
        "stopping",
        "paused",
        "armed",
        "idle",
        "off",
        "offline",
        "",
    }:
        return "stopped"

    return "stopped"


def normalize_runtime_state(value: Any) -> str:
    """Normalizes runtime-plane state values.

    Canonical runtime states:
    - offline
    - starting
    - running
    - stopping
    - errored
    """
    normalized = str(value or "").strip().lower()

    if normalized in {"running", "active", "live"}:
        return "running"

    if normalized in {"starting", "booting", "initializing"}:
        return "starting"

    if normalized in {"stopping", "shutting_down", "shutting-down"}:
        return "stopping"

    if normalized in {"errored", "error", "failed", "fatal"}:
        return "errored"

    if normalized in {"offline", "stopped", "idle", "dead", ""}:
        return "offline"

    return "offline"


def heartbeat_age_or_none(last_heartbeat_at: Any) -> Optional[int]:
    """Computes the age of the last heartbeat in seconds."""
    epoch_seconds = parse_ts_to_epoch_seconds(last_heartbeat_at) or 0
    if epoch_seconds <= 0:
        return None
    return max(0, now_epoch() - int(epoch_seconds))


def compute_effective_state(
    *,
    runtime_state: Any,
    desired_state: Any,
    hb_age_sec: Optional[int],
) -> str:
    """Computes the effective state returned to the frontend.

    Rules:
    - desired_state expresses what the user wants
    - runtime_state expresses what the runner reports
    - heartbeat freshness determines whether runtime can be trusted
    """
    runtime = normalize_runtime_state(runtime_state)
    desired = normalize_desired_state(desired_state)

    # Explicit runtime error should always surface.
    if runtime == "errored":
        return "errored"

    # During explicit shutdown, prefer showing stopping briefly.
    if desired == "stopped" and runtime == "stopping":
        return "stopping"

    # If the user wants the bot stopped, offline means effectively stopped.
    if desired == "stopped":
        if runtime in {"offline", "stopping"}:
            return "stopped" if runtime == "offline" else "stopping"
        if runtime == "errored":
            return "errored"
        # If runner still says running but user wants stopped, surface stopping/offline-ish intent.
        return "stopped"

    # From here down, desired == running.

    # No heartbeat yet:
    # give startup a grace period instead of instantly calling it offline.
    if hb_age_sec is None:
        if runtime in {"starting", "running"}:
            return runtime
        return "starting"

    # Fresh heartbeat
    if hb_age_sec <= 90:
        if runtime in {"starting", "running", "stopping"}:
            return runtime
        if runtime == "offline":
            # User wants running but runner says offline with fresh update.
            # Treat as starting rather than dead to avoid jarring UI bounce.
            return "starting"
        return "starting"

    # Slightly stale heartbeat
    if hb_age_sec <= 360:
        if runtime == "running":
            return "running"
        if runtime == "starting":
            return "starting"
        if runtime == "stopping":
            return "stopping"
        return "offline"

    # Very stale heartbeat means runner truth is no longer trustworthy.
    return "offline"