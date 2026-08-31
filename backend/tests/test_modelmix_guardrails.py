"""Mission 019 cumulative output guardrail coverage (backend enforcement)."""

import asyncio

from backend.modelmix.moderator import ModeratorInput, run_moderator
from backend.modelmix.orchestrator import multiplex_workers
from backend.providers.base import LLMProvider, ProviderStreamEvent


def set_thresholds(monkeypatch, *, warning=40, cap=80):
    monkeypatch.setattr(
        "backend.modelmix.guardrails.WARNING_OUTPUT_THRESHOLD_CHARS", warning
    )
    monkeypatch.setattr("backend.modelmix.guardrails.HARD_OUTPUT_CAP_CHARS", cap)


class DeltasProvider(LLMProvider):
    def __init__(self, deltas, *, finish_reason="stop", gate=None, usage=None):
        self.deltas = tuple(deltas)
        self.finish_reason = finish_reason
        self.gate = gate
        self.usage = usage
        self.cancelled = False
        self.messages = []

    @property
    def supports_streaming(self):
        return True

    async def stream_query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.messages.append(messages)
        try:
            if self.gate:
                await self.gate.wait()
            for delta in self.deltas:
                await asyncio.sleep(0)
                yield ProviderStreamEvent(type="text_delta", delta=delta)
            yield ProviderStreamEvent(
                type="completed",
                result={"content": "".join(self.deltas)},
                finish_reason=self.finish_reason,
                usage=self.usage,
            )
        except asyncio.CancelledError:
            self.cancelled = True
            raise

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        raise AssertionError("streaming fake must not use query fallback")

    async def get_models(self):
        return []

    async def validate_key(self, api_key):
        return {"success": True}


class BlockingProvider(DeltasProvider):
    def __init__(self, gate):
        super().__init__((), gate=gate)


class QueryProvider(LLMProvider):
    def __init__(self, content, *, usage=None):
        self.content = content
        self.usage = usage
        self.messages = []

    @property
    def supports_streaming(self):
        return False

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.messages.append(messages)
        return {"content": self.content, "usage": self.usage, "error": False}

    async def get_models(self):
        return []

    async def validate_key(self, api_key):
        return {"success": True}


class FakeStream:
    """Async provider stream recording aclose calls and optionally raising on close."""

    def __init__(self, deltas, *, finish_reason="stop", close_error=None):
        self.deltas = tuple(deltas)
        self.finish_reason = finish_reason
        self.close_error = close_error
        self.close_calls = 0
        self.closed = False
        self._i = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._i < len(self.deltas):
            event = ProviderStreamEvent(type="text_delta", delta=self.deltas[self._i])
            self._i += 1
            return event
        if self._i == len(self.deltas):
            self._i += 1
            return ProviderStreamEvent(
                type="completed",
                result={"content": "".join(self.deltas)},
                finish_reason=self.finish_reason,
            )
        raise StopAsyncIteration

    async def aclose(self):
        self.close_calls += 1
        self.closed = True
        if self.close_error is not None:
            raise self.close_error


class BareStream:
    """Async provider stream with no `aclose` attribute at all."""

    def __init__(self, deltas):
        self.deltas = tuple(deltas)
        self._i = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._i < len(self.deltas):
            event = ProviderStreamEvent(type="text_delta", delta=self.deltas[self._i])
            self._i += 1
            return event
        if self._i == len(self.deltas):
            self._i += 1
            return ProviderStreamEvent(
                type="completed",
                result={"content": "".join(self.deltas)},
                finish_reason="stop",
            )
        raise StopAsyncIteration


class FakeStreamProvider(LLMProvider):
    """Streaming provider whose stream_query returns an injected stream object."""

    def __init__(self, stream):
        self.stream = stream
        self.messages = []

    @property
    def supports_streaming(self):
        return True

    def stream_query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.messages.append(messages)
        return self.stream

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        raise AssertionError("FakeStreamProvider is streaming-only")

    async def get_models(self):
        return []

    async def validate_key(self, api_key):
        return {"success": True}


async def collect(provider_a, provider_b, **kwargs):
    providers = {"model-a": provider_a, "model-b": provider_b}
    return [
        event
        async for event in multiplex_workers(
            "guardrail prompt", "model-a", "model-b", providers.__getitem__, **kwargs
        )
    ]


# Criterion 1: crossing the warning threshold emits exactly one warning.
async def test_seat_crossing_warning_threshold_emits_exactly_one_warning(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=100_000)
    events = await collect(
        DeltasProvider(("a" * 20, "b" * 20, "c" * 20)),
        DeltasProvider(("ok",)),
    )

    warnings = [event for event in events if event["type"] == "seat_output_warning"]
    assert len(warnings) == 1
    assert warnings[0]["seat_id"] == "worker_a"
    assert warnings[0]["chars"] == 40
    assert warnings[0]["threshold"] == 40
    assert warnings[0]["seq"] < next(
        event["seq"] for event in events if event["type"] == "seat_completed"
    )
    completed_a = next(
        event for event in events
        if event["type"] == "seat_completed" and event["seat_id"] == "worker_a"
    )
    assert completed_a["finish_reason"] == "stop"


# Criterion 2: never crossing the warning threshold emits no warning.
async def test_seat_below_warning_threshold_emits_no_warning(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=100_000)
    events = await collect(
        DeltasProvider(("short",)),
        DeltasProvider(("ok",)),
    )
    assert not any(event["type"] == "seat_output_warning" for event in events)


# Criterion 3: exceeding the hard cap truncates output to exactly the cap length.
async def test_hard_cap_truncates_stream_to_exact_cap_length(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    events = await collect(
        DeltasProvider(("a" * 60, "b" * 60)),
        DeltasProvider(("ok",)),
    )

    deltas_a = [
        event["delta"]
        for event in events
        if event.get("seat_id") == "worker_a" and event["type"] == "seat_delta"
    ]
    joined = "".join(deltas_a)
    assert len(joined) == 80
    assert joined == "a" * 60 + "b" * 20


# Criterion 4: the capped seat terminates as seat_completed, not seat_failed.
async def test_capped_seat_terminates_completed_with_output_cap_finish(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    events = await collect(
        DeltasProvider(("a" * 60, "b" * 60)),
        DeltasProvider(("ok",)),
    )

    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    assert seat_a[-1]["type"] == "seat_completed"
    assert not any(event["type"] == "seat_failed" for event in seat_a)
    assert seat_a[-1]["finish_reason"] == "modelmix_output_cap"
    assert events[-1]["type"] == "run_completed"
    assert events[-1]["status"] == "completed"


# Criterion 5: a seat under both thresholds behaves unchanged.
async def test_seat_under_both_thresholds_behaves_unchanged(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    events = await collect(
        DeltasProvider(("hello ", "world")),
        DeltasProvider(("ok",)),
    )

    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    assert [event["type"] for event in seat_a] == [
        "seat_started", "seat_delta", "seat_delta", "seat_completed",
    ]
    assert "".join(event["delta"] for event in seat_a if event["type"] == "seat_delta") == "hello world"
    assert seat_a[-1]["finish_reason"] == "stop"
    assert not any(event["type"] == "seat_output_warning" for event in events)
    assert events[-1]["type"] == "run_completed"
    assert events[-1]["status"] == "completed"


# Criterion 7: crossing both thresholds yields both events, cap terminal, in order.
async def test_seat_crosses_warning_then_cap_in_order_with_cap_terminal(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    events = await collect(
        DeltasProvider(("a" * 30, "b" * 30, "c" * 30)),
        DeltasProvider(("ok",)),
    )

    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    assert [event["type"] for event in seat_a] == [
        "seat_started",
        "seat_delta",
        "seat_delta",
        "seat_output_warning",
        "seat_delta",
        "seat_completed",
    ]
    joined = "".join(event["delta"] for event in seat_a if event["type"] == "seat_delta")
    assert len(joined) == 80
    assert joined == "a" * 30 + "b" * 30 + "c" * 20
    warning = next(event for event in seat_a if event["type"] == "seat_output_warning")
    assert warning["chars"] == 60
    assert warning["threshold"] == 40
    assert len([event for event in events if event["type"] == "seat_output_warning"]) == 1
    assert seat_a[-1]["type"] == "seat_completed"
    assert seat_a[-1]["finish_reason"] == "modelmix_output_cap"


# Criterion 8: timing out before thresholds emits a timeout failure and no guardrail events.
async def test_timed_out_seat_emits_no_guardrail_events(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    hung = BlockingProvider(asyncio.Event())
    events = await collect(hung, DeltasProvider(("ok",)), seat_timeout=0.05)

    failed = [event for event in events if event["type"] == "seat_failed"]
    assert len(failed) == 1
    assert failed[0]["seat_id"] == "worker_a"
    assert failed[0]["reason"] == "timeout"
    assert not any(event["type"] == "seat_output_warning" for event in events)
    assert not any(event.get("finish_reason") == "modelmix_output_cap" for event in events)
    assert hung.cancelled
    assert events[-1]["type"] == "run_completed"
    assert events[-1]["status"] == "partial"


# Criterion 9: cancellation before thresholds emits seat_cancelled and no guardrail events.
async def test_cancelled_seat_emits_no_guardrail_events():
    gate = asyncio.Event()
    provider_a = BlockingProvider(gate)
    provider_b = BlockingProvider(gate)
    checks = 0

    async def disconnected():
        nonlocal checks
        checks += 1
        return checks > 1

    events = await collect(provider_a, provider_b, is_disconnected=disconnected)
    assert [event["type"] for event in events].count("seat_cancelled") == 2
    assert not any(event["type"] == "seat_output_warning" for event in events)
    assert not any(event.get("finish_reason") == "modelmix_output_cap" for event in events)
    assert not any(event["type"] == "run_completed" for event in events)


# Criterion 10: non-streaming over-cap truncates exactly; under-cap is untouched; no warning.
async def test_non_streaming_over_cap_truncates_with_output_cap_finish(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    events = await collect(
        QueryProvider("z" * 200),
        DeltasProvider(("ok",)),
    )

    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    delta = next(event["delta"] for event in seat_a if event["type"] == "seat_delta")
    assert delta == "z" * 80
    assert len(delta) == 80
    assert seat_a[-1]["type"] == "seat_completed"
    assert seat_a[-1]["finish_reason"] == "modelmix_output_cap"
    assert not any(event["type"] == "seat_output_warning" for event in events)


async def test_non_streaming_under_cap_unaffected_and_no_warning(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    events = await collect(
        QueryProvider("hello", usage={"total_tokens": 7}),
        DeltasProvider(("ok",)),
    )

    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    delta = next(event["delta"] for event in seat_a if event["type"] == "seat_delta")
    assert delta == "hello"
    assert seat_a[-1]["type"] == "seat_completed"
    assert "finish_reason" not in seat_a[-1]
    assert seat_a[-1]["usage"] == {"total_tokens": 7}
    assert not any(event["type"] == "seat_output_warning" for event in events)


# Criterion 6: the Moderator receives the same warning/cap/finish treatment.
async def run_moderator_events(provider, **kwargs):
    events = []

    async def create_event(event_type, **payload):
        event = {"type": event_type, **payload}
        events.append(event)
        return event

    ok = await run_moderator(
        "m",
        provider,
        ModeratorInput(messages=[{"role": "user", "content": "hi"}], truncation={}),
        create_event,
        **kwargs,
    )
    return ok, events


async def test_moderator_crossing_warning_threshold_emits_exactly_one_warning(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=100_000)
    ok, events = await run_moderator_events(
        DeltasProvider(("a" * 20, "b" * 20, "c" * 20))
    )

    warnings = [event for event in events if event["type"] == "moderator_output_warning"]
    assert len(warnings) == 1
    assert warnings[0]["actor"] == "moderator"
    assert warnings[0]["chars"] == 40
    assert warnings[0]["threshold"] == 40
    assert ok is True
    assert events[-1]["type"] == "moderator_completed"
    assert events[-1]["finish_reason"] == "stop"


async def test_moderator_crosses_warning_then_cap_in_order_with_completed_terminal(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    _, events = await run_moderator_events(
        DeltasProvider(("a" * 30, "b" * 30, "c" * 30))
    )

    assert [event["type"] for event in events if event["actor"] == "moderator"] == [
        "moderator_started",
        "moderator_delta",
        "moderator_delta",
        "moderator_output_warning",
        "moderator_delta",
        "moderator_completed",
    ]
    joined = "".join(
        event["delta"] for event in events if event["type"] == "moderator_delta"
    )
    assert len(joined) == 80
    assert joined == "a" * 30 + "b" * 30 + "c" * 20
    assert events[-1]["type"] == "moderator_completed"
    assert events[-1]["finish_reason"] == "modelmix_output_cap"


async def test_moderator_under_thresholds_behaves_unchanged(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)
    ok, events = await run_moderator_events(
        DeltasProvider(("final ", "answer"), finish_reason="stop")
    )

    assert ok is True
    assert not any(event["type"] == "moderator_output_warning" for event in events)
    assert events[-1]["type"] == "moderator_completed"
    assert events[-1]["finish_reason"] == "stop"
    assert "".join(
        event["delta"] for event in events if event["type"] == "moderator_delta"
    ) == "final answer"


# Follow-up (Mission 019): the capped seat closes its provider stream; a stream
# without aclose, or one that errors on close, must not disturb the outcome.
async def test_capped_seat_closes_provider_stream(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)

    stream = FakeStream(("a" * 60, "b" * 60))
    events = await collect(FakeStreamProvider(stream), DeltasProvider(("ok",)))
    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    assert seat_a[-1]["type"] == "seat_completed"
    assert seat_a[-1]["finish_reason"] == "modelmix_output_cap"
    assert stream.close_calls == 1
    assert stream.closed

    stream = BareStream(("a" * 60, "b" * 60))
    events = await collect(FakeStreamProvider(stream), DeltasProvider(("ok",)))
    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    assert seat_a[-1]["type"] == "seat_completed"
    assert seat_a[-1]["finish_reason"] == "modelmix_output_cap"

    stream = FakeStream(("a" * 60, "b" * 60), close_error=RuntimeError("already closed"))
    events = await collect(FakeStreamProvider(stream), DeltasProvider(("ok",)))
    seat_a = [event for event in events if event.get("seat_id") == "worker_a"]
    assert seat_a[-1]["type"] == "seat_completed"
    assert seat_a[-1]["finish_reason"] == "modelmix_output_cap"
    assert stream.close_calls == 1


# Follow-up (Mission 019): the capped Moderator closes its provider stream; a
# stream without aclose, or one that errors on close, must not disturb it.
async def test_capped_moderator_closes_provider_stream(monkeypatch):
    set_thresholds(monkeypatch, warning=40, cap=80)

    stream = FakeStream(("a" * 60, "b" * 60))
    ok, events = await run_moderator_events(FakeStreamProvider(stream))
    assert ok is True
    assert events[-1]["type"] == "moderator_completed"
    assert events[-1]["finish_reason"] == "modelmix_output_cap"
    assert stream.close_calls == 1
    assert stream.closed

    stream = BareStream(("a" * 60, "b" * 60))
    ok, events = await run_moderator_events(FakeStreamProvider(stream))
    assert ok is True
    assert events[-1]["type"] == "moderator_completed"
    assert events[-1]["finish_reason"] == "modelmix_output_cap"

    stream = FakeStream(("a" * 60, "b" * 60), close_error=RuntimeError("already closed"))
    ok, events = await run_moderator_events(FakeStreamProvider(stream))
    assert ok is True
    assert events[-1]["type"] == "moderator_completed"
    assert events[-1]["finish_reason"] == "modelmix_output_cap"
    assert stream.close_calls == 1