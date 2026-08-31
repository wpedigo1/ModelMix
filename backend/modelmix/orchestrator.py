"""Two independent worker orchestration for the first ModelMix slice."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Optional

from ..providers.base import LLMProvider
from . import guardrails, timeouts
from .events import EventSequencer
from .timeouts import aiter_with_deadline

ProviderResolver = Callable[[str], LLMProvider]
DisconnectCheck = Callable[[], Awaitable[bool]]
EventFactory = Callable[..., Awaitable[Dict[str, Any]]]
SEATS = (("worker_a", "worker_a_model"), ("worker_b", "worker_b_model"))


async def multiplex_workers(
    prompt: str,
    worker_a_model: str,
    worker_b_model: str,
    provider_resolver: ProviderResolver,
    is_disconnected: Optional[DisconnectCheck] = None,
    run_id: Optional[str] = None,
    event_factory: Optional[EventFactory] = None,
    emit_run_completed: bool = True,
    seat_histories: Optional[Dict[str, List[Dict[str, str]]]] = None,
    seat_timeout: Optional[float] = None,
    warning_threshold_chars: Optional[int] = None,
    hard_cap_chars: Optional[int] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """Run exactly two isolated model calls and multiplex their visible output."""
    run_id = run_id or str(uuid.uuid4())
    sequencer = EventSequencer(run_id) if event_factory is None else None

    async def create(event_type: str, **payload: Any) -> Dict[str, Any]:
        if event_factory is not None:
            return await event_factory(event_type, **payload)
        assert sequencer is not None
        return sequencer.create(event_type, **payload)

    queue: asyncio.Queue[tuple[str, str, Dict[str, Any]]] = asyncio.Queue()
    models = {"worker_a": worker_a_model, "worker_b": worker_b_model}
    histories = seat_histories or {}

    async def run_seat(seat_id: str, model_id: str) -> None:
        await queue.put((seat_id, "seat_started", {"model": model_id}))
        messages = [
            *histories.get(seat_id, []),
            {"role": "user", "content": prompt},
        ]
        bound = timeouts.SEAT_TIMEOUT_SECONDS if seat_timeout is None else seat_timeout
        warning_limit = (
            guardrails.WARNING_OUTPUT_THRESHOLD_CHARS
            if warning_threshold_chars is None
            else warning_threshold_chars
        )
        cap = (
            guardrails.HARD_OUTPUT_CAP_CHARS
            if hard_cap_chars is None
            else hard_cap_chars
        )
        try:
            provider = provider_resolver(model_id)
            if provider.supports_streaming:
                usage = None
                finish_reason = None
                emitted = 0
                warned = False
                capped = False
                stream = provider.stream_query(model_id, messages)
                async for item in aiter_with_deadline(stream, bound):
                    if item.type == "text_delta" and item.delta:
                        delta, capped = guardrails.clip_delta(
                            item.delta, emitted, cap
                        )
                        if delta:
                            emitted += len(delta)
                            await queue.put((seat_id, "seat_delta", {"delta": delta}))
                        if (
                            not warned
                            and emitted >= warning_limit
                        ):
                            warned = True
                            await queue.put((
                                seat_id,
                                "seat_output_warning",
                                {
                                    "chars": emitted,
                                    "threshold": warning_limit,
                                },
                            ))
                        if capped:
                            await guardrails.close_stream(stream)
                            break
                    elif item.type == "completed":
                        usage = item.usage or (item.result or {}).get("usage")
                        finish_reason = item.finish_reason
                    elif item.type == "error":
                        raise RuntimeError(item.error_message or "Provider stream failed")
                payload: Dict[str, Any] = {}
                if usage is not None:
                    payload["usage"] = usage
                finish_reason = "modelmix_output_cap" if capped else finish_reason
                if finish_reason is not None:
                    payload["finish_reason"] = finish_reason
                await queue.put((seat_id, "seat_completed", payload))
            else:
                result = await asyncio.wait_for(
                    provider.query(model_id, messages), timeout=bound
                )
                if result.get("error"):
                    raise RuntimeError(result.get("error_message") or "Provider query failed")
                content = str(result.get("content") or "")
                capped = len(content) > cap
                if capped:
                    content = content[:cap]
                if content:
                    await queue.put((seat_id, "seat_delta", {"delta": content}))
                payload = {}
                if result.get("usage") is not None:
                    payload["usage"] = result["usage"]
                if capped:
                    payload["finish_reason"] = "modelmix_output_cap"
                await queue.put((seat_id, "seat_completed", payload))
        except asyncio.CancelledError:
            await queue.put((seat_id, "seat_cancelled", {}))
            raise
        except asyncio.TimeoutError:
            await queue.put(
                (seat_id, "seat_failed", {
                    "error": f"Worker timed out after {bound:g} seconds",
                    "reason": "timeout",
                })
            )
        except Exception as exc:
            await queue.put((seat_id, "seat_failed", {"error": str(exc)}))

    yield await create("run_started", seats=list(models))
    tasks = {
        seat_id: asyncio.create_task(run_seat(seat_id, models[seat_id]))
        for seat_id, _ in SEATS
    }
    terminal_seats = set()
    cancelled = False
    failed = False
    try:
        while len(terminal_seats) < len(tasks):
            if not cancelled and is_disconnected is not None and await is_disconnected():
                cancelled = True
                yield await create("run_cancel_requested")
                for task in tasks.values():
                    task.cancel()

            if is_disconnected is None:
                seat_id, event_type, payload = await queue.get()
            else:
                try:
                    seat_id, event_type, payload = await asyncio.wait_for(queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    continue
            yield await create(event_type, seat_id=seat_id, **payload)
            if event_type in {"seat_completed", "seat_failed", "seat_cancelled"}:
                terminal_seats.add(seat_id)
            if event_type == "seat_failed":
                failed = True

        if not cancelled and emit_run_completed:
            yield await create("run_completed", status="partial" if failed else "completed")
    finally:
        for task in tasks.values():
            if not task.done():
                task.cancel()
        await timeouts.await_cancellation_grace(tasks.values())
