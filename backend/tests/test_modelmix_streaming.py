"""Deterministic coverage for the first ModelMix two-worker slice."""

import asyncio
import json

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.modelmix.orchestrator import multiplex_workers
from backend.modelmix.routes import router
from backend.providers.base import LLMProvider, ProviderStreamEvent
from backend.providers.openai_oauth import OpenAIOauthProvider


class FakeProvider(LLMProvider):
    def __init__(self, deltas=(), *, barrier=None, error=None):
        self.deltas = deltas
        self.barrier = barrier
        self.error = error
        self.messages = []
        self.started = False

    @property
    def supports_streaming(self):
        return True

    async def stream_query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.messages.append(messages)
        self.started = True
        if self.barrier:
            await self.barrier()
        if self.error:
            yield ProviderStreamEvent(type="error", error_message=self.error)
            return
        for delta in self.deltas:
            await asyncio.sleep(0)
            yield ProviderStreamEvent(type="text_delta", delta=delta)
        yield ProviderStreamEvent(type="completed", result={"content": "".join(self.deltas)})

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        raise AssertionError("streaming fake must not use query fallback")

    async def get_models(self):
        return []

    async def validate_key(self, api_key):
        return {"success": True}


class FallbackProvider(FakeProvider):
    @property
    def supports_streaming(self):
        return False

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.messages.append(messages)
        return {"content": "fallback", "usage": {"total_tokens": 2}, "error": False}


async def collect(provider_a, provider_b, prompt="same prompt", disconnect=None):
    providers = {"model-a": provider_a, "model-b": provider_b}
    return [
        event
        async for event in multiplex_workers(
            prompt, "model-a", "model-b", providers.__getitem__, disconnect
        )
    ]


async def test_workers_start_concurrently_and_remain_isolated():
    providers = []
    both_started = asyncio.Event()

    async def barrier():
        if all(provider.started for provider in providers):
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)

    providers.extend([FakeProvider(("A",), barrier=barrier), FakeProvider(("B",), barrier=barrier)])
    events = await collect(*providers)

    assert providers[0].messages == providers[1].messages == [[{"role": "user", "content": "same prompt"}]]
    assert all("worker" not in json.dumps(provider.messages) for provider in providers)
    assert [event["type"] for event in events].count("seat_completed") == 2
    assert events[-1]["type"] == "run_completed"
    assert events[-1]["status"] == "completed"


async def test_deltas_are_tagged_and_run_metadata_is_ordered():
    events = await collect(FakeProvider(("a1", "a2")), FakeProvider(("b1", "b2")))
    deltas = [event for event in events if event["type"] == "seat_delta"]
    assert {(event["seat_id"], event["delta"]) for event in deltas} == {
        ("worker_a", "a1"), ("worker_a", "a2"), ("worker_b", "b1"), ("worker_b", "b2")
    }
    seqs = [event["seq"] for event in events]
    assert seqs == list(range(1, len(events) + 1))
    assert len({event["run_id"] for event in events}) == 1


async def test_one_failure_does_not_kill_other_worker():
    events = await collect(FakeProvider(error="broken"), FakeProvider(("still ", "works")))
    assert any(event["type"] == "seat_failed" and event["seat_id"] == "worker_a" for event in events)
    assert [event["delta"] for event in events if event.get("seat_id") == "worker_b" and event["type"] == "seat_delta"] == ["still ", "works"]
    assert events[-1]["type"] == "run_completed"
    assert events[-1]["status"] == "partial"


async def test_non_streaming_provider_fallback_sequence():
    fallback = FallbackProvider()
    events = await collect(fallback, FakeProvider(("native",)))
    seat_events = [event for event in events if event.get("seat_id") == "worker_a"]
    assert [event["type"] for event in seat_events] == ["seat_started", "seat_delta", "seat_completed"]
    assert seat_events[1]["delta"] == "fallback"
    assert seat_events[2]["usage"] == {"total_tokens": 2}


async def test_disconnect_cancels_without_successful_run_completion():
    blocker = asyncio.Event()

    class BlockingProvider(FakeProvider):
        async def stream_query(self, model_id, messages, timeout=120.0, temperature=0.7):
            await blocker.wait()
            yield ProviderStreamEvent(type="completed", result={"content": "late"})

    checks = 0

    async def disconnected():
        nonlocal checks
        checks += 1
        return checks > 1

    events = await collect(BlockingProvider(), BlockingProvider(), disconnect=disconnected)
    assert any(event["type"] == "run_cancel_requested" for event in events)
    assert [event["type"] for event in events].count("seat_cancelled") == 2
    assert not any(event["type"] == "run_completed" for event in events)


async def test_chatgpt_oauth_query_assembles_visible_stream(monkeypatch):
    sse = "\n".join([
        'data: {"type":"response.reasoning.delta","delta":"secret"}',
        'data: {"type":"response.output_text.delta","delta":"hello "}',
        'data: {"type":"response.output_text.delta","delta":"world"}',
        'data: {"type":"response.completed","response":{"status":"completed","usage":{"total_tokens":3}}}',
        "data: [DONE]",
        "",
    ])

    async def token(_provider_id):
        return "token"

    monkeypatch.setattr("backend.providers.openai_oauth.get_oauth_credential", lambda _: {"accountId": "acct"})
    monkeypatch.setattr("backend.providers.openai_oauth.get_valid_access_token", token)

    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, headers={"content-type": "text/event-stream"}, content=sse.encode(), request=request
        )
    )
    async_client = httpx.AsyncClient
    monkeypatch.setattr(
        "backend.providers.openai_oauth.httpx.AsyncClient",
        lambda **kwargs: async_client(transport=transport, **kwargs),
    )

    provider = OpenAIOauthProvider()
    streamed = [event async for event in provider.stream_query("openai-oauth:gpt-5", [{"role": "user", "content": "hi"}])]
    result = await provider.query("openai-oauth:gpt-5", [{"role": "user", "content": "hi"}])
    assert "".join(event.delta for event in streamed if event.type == "text_delta") == "hello world"
    assert result == {"content": "hello world", "usage": {"total_tokens": 3}, "error": False}
    assert "secret" not in result["content"]


def test_provider_query_contract_remains_abstract_but_streaming_optional():
    assert getattr(FallbackProvider(), "supports_streaming") is False


def test_modelmix_route_resolves_both_models_without_ranking(monkeypatch):
    providers = {"model-a": FallbackProvider(), "model-b": FallbackProvider()}
    resolved = []

    def resolve(model_id):
        resolved.append(model_id)
        return providers[model_id]

    monkeypatch.setattr("backend.modelmix.routes.get_provider_for_model", resolve)
    monkeypatch.setattr(
        "backend.council.stage2_collect_rankings",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("ranking must not run")),
    )
    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as client:
        response = client.post(
            "/api/modelmix/runs/stream",
            json={"prompt": "same", "worker_a_model": "model-a", "worker_b_model": "model-b"},
        )

    assert response.status_code == 200
    events = [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    assert resolved == ["model-a", "model-b"]
    assert events[0]["type"] == "run_started"
    assert events[-1]["type"] == "run_completed"
