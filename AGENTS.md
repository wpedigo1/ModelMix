# AGENTS.md

# GLOBAL OPERATING RULES FOR CODING

Be a disciplined software engineer, not an agreeable assistant.

## Accuracy / Verification

Observed state outranks assumptions, summaries, task descriptions, previous model reports, and expected state.

Never claim something happened unless you directly verified it.

Examples:
- “committed” requires observing the commit;
- “pushed” requires verifying the commit/ref exists on the remote;
- “tests pass” requires observing the test result;
- “branch exists” requires checking the applicable local or remote ref;
- “service is running” requires observing runtime/service state;
- “file exists” requires checking the filesystem;
- “permission works” requires successfully exercising the required operation when safe.

Do not infer a root cause from an error alone.

Keep mentally separate:
- VERIFIED FACT
- OBSERVATION
- HYPOTHESIS
- DECISION
- OPEN QUESTION

If an error says HTTP 403, report HTTP 403. Do not claim the cause is credentials, permissions, scope, GitHub, networking, or anything else until verified.

## Repository Ground Truth

Before modifying a repository, inspect enough state to understand where you are.

When relevant, verify:
- repository root;
- current branch;
- HEAD commit;
- working-tree status;
- configured remotes;
- required base branch/ref/commit;
- whether referenced prior work actually exists.

Do not assume a branch or commit named in the task exists.

If a task depends on a base branch/commit that cannot be found, investigate whether it can be fetched or recovered before modifying code.

Never recreate completed work merely because the current checkout cannot see it.

## Git

Do not invent branch names, change branches, rewrite history, amend commits, force-push, merge, rebase, or push unless the task requires it or repository instructions authorize it.

If the task specifies a branch/base, honor it exactly when possible.

A local commit is not a remote commit.

If asked to push:
1. verify the remote exists;
2. push;
3. verify the remote ref resolves to the expected commit;
4. only then report PUSHED/PASS.

If push fails, preserve the local work and report the exact failure. Do not report success.

## Task Discipline

Execute the requested mission, not an expanded version of it.

Before coding:
1. understand the objective;
2. inspect relevant existing implementation;
3. determine whether the requirement is already satisfied;
4. identify constraints and required verification;
5. then implement.

Do not redo completed work.

Do not silently redesign settled architecture.

Do not add speculative infrastructure, abstractions, dependencies, refactors, compatibility layers, or “nice to have” work unless they materially support the task.

Challenge technically bad task assumptions when evidence warrants it. Explain the conflict briefly instead of blindly implementing a harmful approach.

## Resource Discipline

Protect time, tokens, CI usage, network calls, and compute.

Prefer focused repository inspection over broad scans.

Run the smallest useful verification while developing, then the required final verification.

Do not automatically create plan → implementation → QC loops.

Do not ask another model to review work unless explicitly requested or the task requires it.

## Research

When current external information materially affects implementation and network/web access is available, research the narrow issue needed.

Do not perform broad research for stable, repository-local work.

Never silently replace established project architecture with a newer pattern discovered online.

## Implementation

Prefer existing project conventions and dependencies.

Reuse existing abstractions when appropriate, but do not contort new work around a bad abstraction solely to avoid changing code.

Make the smallest coherent change that fully satisfies the requirement.

Do not hide failures.

Do not fake provider behavior, telemetry, tests, external services, responses, or successful integrations.

## Testing

Run tests/checks that exercise the changed behavior.

If repository instructions specify required tests, run them.

Do not claim unexecuted tests passed.

If a test cannot run, report:
- what was attempted;
- what prevented it;
- what remains unverified.

## Final Response

Keep final reports concise.

Include:
- result: PASS / PARTIAL / FAIL when appropriate;
- what changed;
- tests actually run and their observed result;
- commit SHA if created;
- remote verification only if actually performed;
- unresolved issues or blockers.

Do not pad the response with generic explanations or recommendations unless they materially matter.

# MODELMIX PRODUCT RULES

ModelMix is the product being built in this repository. The inherited AI Counsel code is useful chassis and provider infrastructure, but inherited product behavior is not automatically ModelMix product doctrine.

## Core Purpose

ModelMix reduces single-model bias and unsupported conclusions by using multiple independent models plus a central Moderator.

Default workflow:
1. Worker A independently answers the user.
2. Worker B independently answers the user.
3. The Moderator receives the required worker outputs after they finish and produces the final synthesis.

Independent workers must not:
- know the other worker exists;
- see the other worker's answer;
- critique, rank, or wait for the other worker;
- receive the other worker's identity or conclusions.

The side models are independent witnesses. The Moderator is the only role that knows the full picture.

The Moderator evaluates evidence, uncertainty, and disagreement. It must not merely majority-vote or concatenate worker responses.

Do not reintroduce inherited AI Counsel Stage 2 peer-ranking behavior into the default ModelMix workflow unless an approved design explicitly calls for it.

## Seats and Roles

Seats are resources. Roles are assignments.

Default bench:
- Seat 1: Moderator
- Seat 2: Worker A
- Seat 3: Worker B
- Seats 4–10: reserve capacity

Default execution remains two independent workers plus one Moderator. Do not expand the active roster merely because reserve seats exist.

The Moderator is selectable; it is not hardwired to one provider or vendor.

## Cockpit UI

The default ModelMix interface is three persistent full-height chat panels:

`Worker A | wider Moderator | Worker B`

Keep the primary interface sparse. Advanced telemetry, conflict/source views, detach/layout tools, and similar power features belong behind secondary controls unless an approved design change promotes them.

Send and Stop are separate, fixed, adjacent controls:
- idle/composing: Send active, Stop disabled;
- running: Send disabled, Stop active;
- never morph Send into Stop at the same cursor location.

Protect:
- worker independence;
- session continuity;
- replay/reconnect behavior;
- visible partial/failure/cancelled states;
- explicit cancellation semantics;
- secure credential handling.

Do not fake provider/account usage or telemetry. Clearly distinguish authoritative provider-reported data from ModelMix-tracked or estimated data. Unknown/unavailable telemetry must remain labeled unknown/unavailable.

## Current Alpha Architecture

Current ModelMix alpha uses:
- FastAPI backend;
- React 19 + Vite frontend;
- SSE for run streaming/replay;
- process-local run/event state;
- single-worker backend deployment assumptions for ModelMix run journals;
- inherited provider/settings/credential infrastructure where appropriate.

Do not replace SSE with WebSockets without an approved architectural change.

Do not add distributed persistence, queues, multi-worker coordination, or paid backend services unless a mission explicitly requires an approved architecture change.

# REPOSITORY TECHNICAL REFERENCE

## Chassis Status

This repository still contains substantial inherited AI Counsel code and package metadata. `pyproject.toml` currently identifies the Python package as `the-ai-counsel` version `0.11.4`, and the frontend package is likewise still version `0.11.4`.

Treat inherited AI Counsel modules as reusable chassis/legacy code, not as authority for ModelMix product behavior.

When changing ModelMix behavior:
- prefer the `backend/modelmix/` and ModelMix frontend seams where they fit;
- reuse existing provider, credential, settings, search, document, Markdown, and cost infrastructure when appropriate;
- do not contort ModelMix around obsolete Council/Advisor/Stage 1–3 assumptions merely to minimize edits.

## Running the Application

From the repository root:

```bash
# Install/sync backend dependencies
uv sync

# Start backend
uv run python -m backend.main
```

In another terminal:

```bash
# Install frontend dependencies
npm install --prefix frontend

# Start frontend
cd frontend
npm run dev
```

Current development endpoints inherited by the chassis:
- backend: `http://localhost:8001`
- frontend: `http://localhost:5173`
- ModelMix cockpit: `http://localhost:5173/modelmix`

For deliberate LAN exposure, use the existing bind/host configuration rather than casually changing defaults.

## Language / Framework Baseline

Backend:
- Python `>=3.10`
- FastAPI
- Uvicorn
- Pydantic
- httpx
- pytest / pytest-asyncio
- Ruff available in the dev dependency group

Frontend:
- React 19
- Vite 7
- `react-select`
- `react-markdown`
- ESLint 9

Prefer existing dependencies before adding new libraries.

## Python Import Convention

Backend package modules use relative imports.

```python
from .config import ...
from .council import ...
```

Run the backend as a module from the repository root:

```bash
uv run python -m backend.main
```

Do not switch to `cd backend && python main.py` as a workaround for import problems.

## Provider and Model Routing

The inherited provider system remains the routing foundation. `backend.council.get_provider_for_model()` resolves provider/model IDs used by ModelMix.

Preserve exact model IDs across discovery, selection, requests, logs, and replay. Do not silently substitute another provider/model.

Current ModelMix selector discovery reuses configured provider state rather than maintaining a separate ModelMix model registry. The discovery seam is `frontend/src/configuredModels.js` and draws from configured/enabled sources such as OpenRouter, Ollama, direct providers, custom endpoints, and supported OAuth sources.

A provider/model should appear only when the inherited configuration says the source is actually configured/enabled. Avoid polling providers on every keystroke.

## ModelMix Backend Map

Primary ModelMix backend package:

- `backend/modelmix/events.py` — event shapes/helpers
- `backend/modelmix/journal.py` — retained event journal, sequence/replay/tail behavior
- `backend/modelmix/moderator.py` — Moderator synthesis behavior
- `backend/modelmix/orchestrator.py` — independent worker execution and fan-in
- `backend/modelmix/registry.py` — process-local active run registry
- `backend/modelmix/routes.py` — ModelMix HTTP/SSE routes

`backend/main.py` mounts the ModelMix router while the inherited application remains available.

Current ModelMix API surface:

```text
POST /api/modelmix/runs/stream
GET  /api/modelmix/runs/{run_id}/events
POST /api/modelmix/runs/{run_id}/cancel
```

`POST /api/modelmix/runs/stream` receives:
- `prompt`
- `worker_a_model`
- `worker_b_model`
- optional `moderator_model`

The cockpit currently requires explicit A/Moderator/B selection before Send, so frontend code should not depend on an implicit Moderator default.

## SSE / Replay / Cancellation

ModelMix uses one multiplexed SSE stream with globally ordered event sequence numbers.

Replay supports:
- `after_seq` query cursor;
- `Last-Event-ID` header cursor;
- HTTP 404 when the run is missing/expired;
- HTTP 409 when requested replay is no longer retained.

The backend returns the run ID in `X-ModelMix-Run-ID` for the initial stream.

Do not give each panel an independent network stream or independent sequence counter.

Subscriber/stream loss is not the same as cancellation. Cancellation must go through the explicit cancel endpoint.

Reconnect/replay must preserve already-rendered Worker A, Moderator, and Worker B output and deduplicate replayed events by the global sequence.

## ModelMix Frontend Map

`frontend/src/main.jsx` selects the lazy ModelMix cockpit when the browser path is `/modelmix`; the inherited app remains the default root view.

Primary ModelMix frontend seams:
- `frontend/src/components/ModelMixObserver.jsx` — cockpit composition and run controls
- `frontend/src/components/ModelMixObserver.css` — three-panel layout
- `frontend/src/modelmixApi.js` — run/stream/replay/cancel transport
- `frontend/src/modelmixState.js` — centralized run/panel state reducer
- `frontend/src/modelmixState.test.js` — reducer/control/replay behavior tests
- `frontend/src/configuredModels.js` — configured-provider model discovery
- `frontend/src/configuredModels.test.js` — discovery behavior tests
- `frontend/src/components/SearchableModelSelect.jsx` — inherited searchable selector reused by ModelMix

Keep Worker A, Moderator, and Worker B as persistent sibling surfaces. Do not remount panels merely because run state changes.

Model selectors must:
- search configured models;
- preserve exact IDs;
- expose accessible labels/keyboard behavior through the existing selector component;
- remain disabled while a run is connecting, active, reconnecting, or cancelling;
- fail honestly when configured model discovery produces no usable choices.

## Legacy Chassis Areas Worth Reusing Carefully

The inherited repository still contains useful infrastructure for:
- provider adapters and routing;
- credential storage and OAuth sessions;
- non-secret settings persistence;
- web search providers;
- document extraction;
- Markdown rendering safety;
- cost/usage normalization;
- CORS and app startup;
- shared model selector UI.

Before copying an inherited Council/Advisor implementation pattern into ModelMix, confirm that the behavior is infrastructure rather than obsolete product logic.

Examples of inherited product concepts that are not default ModelMix doctrine:
- Council Stage 1/2/3 workflow;
- anonymous peer ranking;
- Chairman terminology;
- Council/Advisor execution-mode semantics;
- Council presets as the ModelMix seat model.

## Common Technical Gotchas

- Backend development port is `8001`, not `8000`.
- Frontend development port is `5173`.
- React StrictMode can expose duplicate-effect/state bugs; preserve immutable updates and idempotent lifecycle behavior.
- Model/provider prefixes matter. Check explicit prefixes before fuzzy/name-based provider detection.
- Provider discovery can fail independently; one failed discovery source should not require inventing models from that source.
- ModelMix run/event journals are process-local in the current alpha; do not claim restart durability or multi-process replay.
- Use safe string handling when rendering provider output through Markdown components.
- Do not clear accumulated transcript text when a run fails, reconnects, becomes partial, or is cancelled unless a new run/reset is explicitly initiated.

## Testing / Verification

Backend regression baseline:

```bash
uv run pytest -q
```

Frontend build:

```bash
cd frontend
npm run build
```

Frontend repository lint command:

```bash
cd frontend
npm run lint
```

For focused ModelMix frontend verification, run the directly affected Node tests, for example:

```bash
cd frontend
node --test src/modelmixState.test.js src/configuredModels.test.js
```

Use focused ESLint on touched ModelMix files while developing. If repository-wide lint reports inherited/unrelated failures, report those separately; do not hide them and do not mislabel them as regressions caused by the current mission without evidence.

When behavior is browser-facing, verify the actual `/modelmix` surface when the environment permits. Do not substitute a build result for a visual/runtime claim.

## Documentation and Change Scope

Mission result documents live under `docs/modelmix/` when a mission requires one.

When changing inherited APIs/settings/credentials that remain shared with ModelMix, inspect the existing documentation-sync requirements before committing. Do not blindly carry forward obsolete AI Counsel documentation into new ModelMix product docs.

Keep ModelMix mission commits focused. Preserve unrelated local modifications unless the mission explicitly includes them.
