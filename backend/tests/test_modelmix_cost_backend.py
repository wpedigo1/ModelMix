"""Mission 044: real per-token cost computation for OpenRouter-routed seats.

Cost is only ever computed when ALL hold: openrouter:-prefixed model id,
cached per-token pricing, and real token counts in usage. Every other case
leaves ``cost_usd`` entirely absent (never 0, never guessed).
"""

import asyncio
import json

import pytest

from backend.modelmix.moderator import ModeratorInput, run_moderator
from backend.modelmix.orchestrator import multiplex_workers
from backend.providers.base import LLMProvider, ProviderStreamEvent
from backend.providers.openrouter import (
    _PRICING,
    OpenRouterProvider,
    compute_openrouter_cost_usd,
)

MODEL = "openrouter:vendor/test-model"
PROMPT_PRICE = 1.5e-6
COMPLETION_PRICE = 6e-6


@pytest.fixture(autouse=True)
def clean_pricing_cache():
    _PRICING.clear()
    yield
    _PRICING.clear()


def seed_pricing():
    _PRICING["vendor/test-model"] = {
        "prompt": PROMPT_PRICE,
        "completion": COMPLETION_PRICE,
    }


class DeltasProvider(LLMProvider):
    def __init__(self, deltas, *, usage=None):
        self.deltas = tuple(deltas)
        self.usage = usage
        self.messages = []

    @property
    def supports_streaming(self):
        return True

    async def stream_query(self, model_id, messages, timeout=120.0, temperature=0.7):
        self.messages.append(messages)
        for delta in self.deltas:
            await asyncio.sleep(0)
            yield ProviderStreamEvent(type="text_delta", delta=delta)
        yield ProviderStreamEvent(
            type="completed",
            result={"content": "".join(self.deltas), "usage": self.usage},
            finish_reason="stop",
            usage=self.usage,
        )

    async def query(self, model_id, messages, timeout=120.0, temperature=0.7):
        raise AssertionError("streaming fake must not use query fallback")

    async def get_models(self):
        return []

    async def validate_key(self, api_key):
        return {"success": True}


async def collect_seat_events(model_id, provider, prompt="hello"):
    events = []
    async for event in multiplex_workers(
        prompt, model_id, None, lambda mid: provider
    ):
        events.append(event)
    return events


class _FakeResponse:
    def __init__(self, payload):
        self.status_code = 200
        self._payload = payload

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, payload):
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, *args, **kwargs):
        return _FakeResponse(self._payload)


@pytest.mark.asyncio
async def test_get_models_includes_real_per_token_pricing(monkeypatch):
    payload = {
        "data": [
            {
                "id": "vendor/test-model",
                "name": "Test Model",
                "pricing": {"prompt": "0.0000015", "completion": "0.000006"},
            },
            {
                "id": "vendor/free-model",
                "name": "Free Model",
                "pricing": {"prompt": "0", "completion": "0"},
            },
        ]
    }
    monkeypatch.setattr(
        "backend.providers.openrouter.get_api_key", lambda _provider: "test-key"
    )
    monkeypatch.setattr(
        "httpx.AsyncClient", lambda *a, **kw: _FakeClient(payload)
    )

    models = await OpenRouterProvider().get_models()

    by_id = {model["id"]: model for model in models}
    paid = by_id["openrouter:vendor/test-model"]
    free = by_id["openrouter:vendor/free-model"]

    assert paid["prompt_price_per_token"] == 1.5e-6
    assert paid["completion_price_per_token"] == 6e-6
    assert paid["is_free"] is False
    assert free["prompt_price_per_token"] == 0.0
    assert free["completion_price_per_token"] == 0.0
    assert free["is_free"] is True

    assert _PRICING["vendor/test-model"] == {
        "prompt": 1.5e-6,
        "completion": 6e-6,
    }
    assert _PRICING["vendor/free-model"] == {"prompt": 0.0, "completion": 0.0}


@pytest.mark.asyncio
async def test_cached_priced_openrouter_seat_gets_exact_cost_usd():
    seed_pricing()
    usage = {"prompt_tokens": 1000, "completion_tokens": 500}
    provider = DeltasProvider(("answer",), usage=usage)

    events = await collect_seat_events(MODEL, provider)

    completed = [e for e in events if e["type"] == "seat_completed"]
    assert len(completed) == 1
    # 1000 * 1.5e-6 + 500 * 6e-6 = 0.0015 + 0.003 = 0.0045
    assert completed[0]["cost_usd"] == 1000 * PROMPT_PRICE + 500 * COMPLETION_PRICE
    assert completed[0]["cost_usd"] == pytest.approx(0.0045, rel=1e-12)


@pytest.mark.asyncio
async def test_uncached_openrouter_pricing_leaves_cost_usd_absent():
    usage = {"prompt_tokens": 1000, "completion_tokens": 500}
    provider = DeltasProvider(("answer",), usage=usage)

    events = await collect_seat_events(MODEL, provider)

    completed = [e for e in events if e["type"] == "seat_completed"]
    assert len(completed) == 1
    assert "cost_usd" not in completed[0]


@pytest.mark.asyncio
async def test_non_openrouter_model_never_gets_cost_usd():
    seed_pricing()
    usage = {"prompt_tokens": 1000, "completion_tokens": 500}
    provider = DeltasProvider(("answer",), usage=usage)

    events = await collect_seat_events("other-provider/test-model", provider)

    completed = [e for e in events if e["type"] == "seat_completed"]
    assert len(completed) == 1
    assert completed[0]["usage"] == usage
    assert "cost_usd" not in completed[0]


@pytest.mark.asyncio
async def test_moderator_gets_exact_cost_usd_when_priced():
    seed_pricing()
    usage = {"prompt_tokens": 2000, "completion_tokens": 1000}
    provider = DeltasProvider(("synthesis",), usage=usage)
    created = []

    async def create_event(event_type, **payload):
        created.append({"type": event_type, **payload})
        return created[-1]

    completed = await run_moderator(MODEL, provider, MODERATOR_INPUT, create_event)

    assert completed is True
    moderator_completed = [
        event for event in created if event["type"] == "moderator_completed"
    ]
    assert len(moderator_completed) == 1
    # 2000 * 1.5e-6 + 1000 * 6e-6 = 0.003 + 0.006 = 0.009
    assert moderator_completed[0]["cost_usd"] == pytest.approx(0.009, rel=1e-12)


@pytest.mark.asyncio
async def test_moderator_without_pricing_leaves_cost_usd_absent():
    usage = {"prompt_tokens": 2000, "completion_tokens": 1000}
    provider = DeltasProvider(("synthesis",), usage=usage)
    created = []

    async def create_event(event_type, **payload):
        created.append({"type": event_type, **payload})
        return created[-1]

    await run_moderator(MODEL, provider, MODERATOR_INPUT, create_event)

    moderator_completed = [
        event for event in created if event["type"] == "moderator_completed"
    ]
    assert len(moderator_completed) == 1
    assert "cost_usd" not in moderator_completed[0]


@pytest.mark.asyncio
async def test_compute_rejects_non_numeric_or_negative_tokens():
    seed_pricing()
    assert compute_openrouter_cost_usd(MODEL, None) is None
    assert compute_openrouter_cost_usd(MODEL, {"prompt_tokens": "5", "completion_tokens": 1}) is None
    assert compute_openrouter_cost_usd(MODEL, {"prompt_tokens": -1, "completion_tokens": 1}) is None
    assert compute_openrouter_cost_usd("plain/model", {"prompt_tokens": 5, "completion_tokens": 1}) is None

MODERATOR_INPUT = ModeratorInput(messages=[{"role": "user", "content": "prompt"}], truncation={})

