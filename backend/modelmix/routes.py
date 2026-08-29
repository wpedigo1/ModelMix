"""HTTP routes for the experimental ModelMix streaming slice."""

import json
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..council import get_provider_for_model
from .journal import ReplayUnavailableError, RunEventJournal
from .persistence import PersistenceError
from .registry import run_registry

router = APIRouter(prefix="/api/modelmix", tags=["modelmix"])


class TwoWorkerRequest(BaseModel):
    prompt: str = Field(min_length=1)
    worker_a_model: str = Field(min_length=1)
    worker_b_model: str = Field(min_length=1)
    moderator_model: Optional[str] = Field(default=None, min_length=1)
    session_id: Optional[str] = Field(default=None, min_length=1)


@router.post("/runs/stream")
async def stream_two_workers(body: TwoWorkerRequest) -> StreamingResponse:
    """Launch two independent witnesses and return one multiplexed SSE feed."""
    try:
        run = await run_registry.start(
            body.prompt,
            body.worker_a_model,
            body.worker_b_model,
            get_provider_for_model,
            body.moderator_model,
            body.session_id,
        )
    except PersistenceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _stream_run(run, after_seq=0)


@router.get("/sessions/latest")
async def latest_session() -> dict:
    """Return the latest canonical durable cockpit state, if one exists."""
    try:
        document = await run_registry.persistence.latest_session()
    except PersistenceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if document is None:
        raise HTTPException(status_code=404, detail="No persisted ModelMix session")
    return document


@router.get("/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    try:
        document = await run_registry.persistence.load_session(session_id)
    except PersistenceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if document is None:
        raise HTTPException(status_code=404, detail="ModelMix session not found")
    return document


@router.get("/runs/{run_id}/events")
async def replay_run_events(
    run_id: str,
    after_seq: Optional[int] = Query(default=None, ge=0),
    last_event_id: Optional[str] = Header(default=None, alias="Last-Event-ID"),
) -> StreamingResponse:
    """Replay retained events and tail an active run."""
    run = await run_registry.get(run_id)
    if run is None:
        try:
            run = await run_registry.restore_persisted(run_id)
        except PersistenceError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    if run is None:
        raise HTTPException(status_code=404, detail="ModelMix run not found or expired")
    cursor = _resolve_cursor(after_seq, last_event_id)
    try:
        await run.events_after(cursor)
    except ReplayUnavailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _stream_run(run, cursor)


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str) -> dict:
    """Idempotently request cancellation of an active ModelMix run."""
    run = await run_registry.cancel(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="ModelMix run not found or expired")
    return {
        "run_id": run.run_id,
        "status": run.status,
        "cancellation_requested": run.cancellation_requested,
    }


def _resolve_cursor(after_seq: Optional[int], last_event_id: Optional[str]) -> int:
    if after_seq is not None:
        return after_seq
    if not last_event_id:
        return 0
    try:
        cursor = int(last_event_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Last-Event-ID must be a non-negative integer") from exc
    if cursor < 0:
        raise HTTPException(status_code=400, detail="Last-Event-ID must be a non-negative integer")
    return cursor


def _stream_run(run: RunEventJournal, after_seq: int) -> StreamingResponse:
    """Create an SSE subscriber without transferring ownership of the run."""

    async def event_stream():
        async for event in run.tail(after_seq):
            yield f"id: {event['seq']}\ndata: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-ModelMix-Run-ID": run.run_id,
            "X-ModelMix-Session-ID": run.session_id or "",
        },
    )
