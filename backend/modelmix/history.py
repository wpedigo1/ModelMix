"""Seat-scoped historical context assembly for ModelMix sessions."""

from __future__ import annotations

from typing import Any, Dict, List

from .moderator import _bounded_visible_text

MAX_SEAT_HISTORY_TURNS = 8


def build_seat_history(
    session_document: Dict[str, Any],
    seat_id: str,
    *,
    exclude_run_id: str,
    max_turns: int = MAX_SEAT_HISTORY_TURNS,
) -> List[Dict[str, str]]:
    """Return bounded prior prompt/answer pairs visible to exactly one seat."""
    if max_turns <= 0:
        return []

    session = session_document["session"]
    messages = session["messages"]
    turns: List[List[Dict[str, str]]] = []
    for run in session["runs"]:
        run_id = run["run_id"]
        if run_id == exclude_run_id:
            continue
        own_message = next(
            (
                message
                for message in messages
                if message.get("run_id") == run_id
                and message.get("seat") == seat_id
                and message.get("content")
            ),
            None,
        )
        if own_message is None:
            continue
        prompt, _ = _bounded_visible_text(run["prompt"])
        answer, _ = _bounded_visible_text(own_message["content"])
        turns.append([
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": answer},
        ])

    return [message for turn in turns[-max_turns:] for message in turn]
