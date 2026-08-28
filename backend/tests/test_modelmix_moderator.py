"""Deterministic tests for the ModelMix Moderator fan-in phase."""

import asyncio

from backend.modelmix.moderator import (
    MAX_VISIBLE_OUTPUT_CHARS,
    ModeratorOutputLimits,
    assemble_moderator_input,
    run_moderator,
)
from backend.modelmix.registry import RunRegistry
from backend.providers.base import LLMProvider, ProviderStreamEvent


class StreamingProvider(LLMProvider):
    def __init__(self, deltas=(), gate=None, failure=None):
        self.deltas = tuple(deltas)
        self.gate = gate
        self.failure = failure
        self.messages = []
        self.started = False
        self.cancelled = False

    @property
    def supports_streaming(self):
        return True

    async def stream_query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.started = True
        self.messages.append(messages)
        try:
            if self.gate:
                await self.gate.wait()
            if self.failure:
                yield ProviderStreamEvent(type="error", error_message=self.failure)
                return
            for delta in self.deltas:
                yield ProviderStreamEvent(type="text_delta", delta=delta)
            yield ProviderStreamEvent(
                type="completed",
                result={"content": "".join(self.deltas), "reasoning": "private"},
                finish_reason="stop",
            )
        except asyncio.CancelledError:
            self.cancelled = True
            raise

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        raise AssertionError("streaming provider used query fallback")

    async def get_models(self):
        return []

    async def validate_key(self, api_key):
        return {"success": True}


class NonStreamingModerator(StreamingProvider):
    @property
    def supports_streaming(self):
        return False

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.started = True
        self.messages.append(messages)
        return {"content": "fallback synthesis", "finish_reason": "stop", "error": False}


async def wait_for(predicate, timeout=1):
    deadline = asyncio.get_running_loop().time() + timeout
    while not predicate():
        if asyncio.get_running_loop().time() >= deadline:
            raise TimeoutError("condition was not reached")
        await asyncio.sleep(0)


async def start_run(worker_a, worker_b, moderator):
    providers = {"a": worker_a, "b": worker_b, "m": moderator}
    registry = RunRegistry()
    run = await registry.start("original prompt", "a", "b", providers.__getitem__, "m")
    return registry, run


async def test_moderator_waits_for_both_workers_and_receives_visible_isolated_outputs():
    gate_a = asyncio.Event()
    gate_b = asyncio.Event()
    worker_a = StreamingProvider(("visible A",), gate_a)
    worker_b = StreamingProvider(("visible B",), gate_b)
    moderator = StreamingProvider(("final ", "answer"))
    _, run = await start_run(worker_a, worker_b, moderator)

    await wait_for(lambda: worker_a.started and worker_b.started)
    gate_a.set()
    await wait_for(lambda: any(event["type"] == "seat_completed" for event in run._events))
    assert not moderator.started
    gate_b.set()
    await run.task

    moderator_text = moderator.messages[0][1]["content"]
    assert "original prompt" in moderator_text
    assert "Worker A visible output:\nvisible A" in moderator_text
    assert "Worker B visible output:\nvisible B" in moderator_text
    assert "private" not in moderator_text
    assert worker_a.messages == [[{"role": "user", "content": "original prompt"}]]
    assert worker_b.messages == [[{"role": "user", "content": "original prompt"}]]
    assert "visible B" not in str(worker_a.messages)
    assert "visible A" not in str(worker_b.messages)
    assert "final answer" not in str(worker_a.messages + worker_b.messages)

    events = await run.events_after(0)
    moderator_events = [event for event in events if event["type"].startswith("moderator_")]
    assert [event["type"] for event in moderator_events] == [
        "moderator_started", "moderator_delta", "moderator_delta", "moderator_completed"
    ]
    assert all(event["run_id"] == run.run_id for event in events)
    assert [event["seq"] for event in events] == list(range(1, len(events) + 1))
    assert events[-1]["type"] == "run_completed"
    assert events[-1]["status"] == "completed"


async def test_one_worker_failure_allows_honest_partial_moderation():
    worker_a = StreamingProvider(failure="worker A failed")
    worker_b = StreamingProvider(("usable B",))
    moderator = StreamingProvider(("synthesis",))
    _, run = await start_run(worker_a, worker_b, moderator)
    await run.task

    handoff = moderator.messages[0][1]["content"]
    assert "Worker A status:\nUnavailable because the worker failed." in handoff
    assert "Worker B visible output:\nusable B" in handoff
    events = await run.events_after(0)
    assert any(event["type"] == "seat_failed" and event["seat_id"] == "worker_a" for event in events)
    assert events[-1]["type"] == "run_completed"
    assert events[-1]["status"] == "partial"
    assert run.status == "partial"


async def test_both_workers_failing_prevents_moderator_synthesis():
    moderator = StreamingProvider(("must not run",))
    _, run = await start_run(
        StreamingProvider(failure="A failed"),
        StreamingProvider(failure="B failed"),
        moderator,
    )
    await run.task
    events = await run.events_after(0)
    assert not moderator.started
    assert any(event["type"] == "moderator_failed" and event["reason"] == "insufficient_input" for event in events)
    assert events[-1]["type"] == "run_failed"
    assert not any(event["type"] == "run_completed" for event in events)
    assert run.status == "failed"


async def test_moderator_failure_preserves_worker_output_and_fails_run():
    moderator = StreamingProvider(failure="moderator unavailable")
    _, run = await start_run(
        StreamingProvider(("kept A",)), StreamingProvider(("kept B",)), moderator
    )
    await run.task
    events = await run.events_after(0)
    assert "".join(
        event["delta"] for event in events
        if event["type"] == "seat_delta" and event["seat_id"] == "worker_a"
    ) == "kept A"
    assert any(event["type"] == "moderator_failed" for event in events)
    assert events[-1]["type"] == "run_failed"
    assert not any(event["type"] == "run_completed" for event in events)


async def test_non_streaming_moderator_fallback_is_replayable_once():
    moderator = NonStreamingModerator()
    _, run = await start_run(
        StreamingProvider(("A",)), StreamingProvider(("B",)), moderator
    )
    await run.task
    events = await run.events_after(0)
    delta = next(event for event in events if event["type"] == "moderator_delta")
    replay = await run.events_after(delta["seq"] - 1)
    assert replay[0] is delta
    assert delta["delta"] == "fallback synthesis"
    assert sum(event["type"] == "moderator_delta" for event in events) == 1


async def test_cancel_before_moderator_prevents_start_and_is_replayable():
    gate = asyncio.Event()
    worker_a = StreamingProvider(("A",), gate)
    worker_b = StreamingProvider(("B",), gate)
    moderator = StreamingProvider(("final",))
    registry, run = await start_run(worker_a, worker_b, moderator)
    await wait_for(lambda: worker_a.started and worker_b.started)
    await registry.cancel(run.run_id)
    await run.task
    events = await run.events_after(0)
    assert not moderator.started
    assert run.status == "cancelled"
    assert any(event["type"] == "run_cancelled" for event in events)
    assert not any(event["type"] == "run_completed" for event in events)


async def test_cancel_during_moderator_cancels_it_without_success():
    moderator_gate = asyncio.Event()
    moderator = StreamingProvider(("late",), moderator_gate)
    registry, run = await start_run(
        StreamingProvider(("A",)), StreamingProvider(("B",)), moderator
    )
    await wait_for(lambda: moderator.started)
    await registry.cancel(run.run_id)
    await run.task
    events = await run.events_after(0)
    assert moderator.cancelled
    assert run.status == "cancelled"
    assert not any(event["type"] in {"moderator_completed", "run_completed"} for event in events)


async def test_input_truncation_and_unsupported_hard_cap_are_explicit():
    long_text = "x" * (MAX_VISIBLE_OUTPUT_CHARS + 10)
    moderator_input = assemble_moderator_input("prompt", {"worker_a": long_text}, {"worker_b": "failed"})
    assert moderator_input.truncation == {"worker_a": True}
    assert "truncated deterministically" in moderator_input.messages[1]["content"]
    handoff_output = moderator_input.messages[1]["content"].split("Worker A visible output:\n", 1)[1]
    handoff_output = handoff_output.split("\n\nWorker B status:", 1)[0]
    assert len(handoff_output) == MAX_VISIBLE_OUTPUT_CHARS

    events = []

    async def create_event(event_type, **payload):
        event = {"type": event_type, **payload}
        events.append(event)
        return event

    try:
        await run_moderator(
            "m",
            NonStreamingModerator(),
            moderator_input,
            create_event,
            ModeratorOutputLimits(hard_cap_tokens=10),
        )
    except ValueError as exc:
        assert "not supported" in str(exc)
    else:
        raise AssertionError("unsupported hard cap must fail clearly")
    assert events == []
