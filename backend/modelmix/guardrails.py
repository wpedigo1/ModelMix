"""ModelMix-owned cumulative output bounds for a single participant turn.

Worker A, Worker B, and the Moderator share one hard output cap so no single
turn can generate unbounded visible output. The values below are provisional
defaults; configurable thresholds arrive in a later settings mission.

The output cap is distinct from the wall-clock timeouts in timeouts.py and the
historical char budgets in history.py. Whichever bound is reached first
governs; reaching the output cap is a ModelMix termination
(finish_reason "modelmix_output_cap"), never a provider or failure outcome.
"""

from __future__ import annotations

WARNING_OUTPUT_THRESHOLD_CHARS = 20_000
HARD_OUTPUT_CAP_CHARS = 40_000


def clip_delta(delta: str, emitted: int, cap: int) -> tuple[str, bool]:
    """Clip one stream delta so cumulative emitted chars never exceed cap.

    Returns (delta_to_emit, capped). The clipped delta always keeps the output
    at exactly `cap` characters when the producer would have gone over.
    `capped` is True exactly when the cumulative budget is exhausted, so
    callers stop consuming the provider stream instead of waiting for more.
    """
    remaining = cap - emitted
    if remaining <= 0:
        return "", True
    if len(delta) > remaining:
        return delta[:remaining], True
    return delta, False