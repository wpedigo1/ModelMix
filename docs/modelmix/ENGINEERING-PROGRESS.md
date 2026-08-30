# ModelMix Engineering Progress

Updated: 2026-08-29 CT

This is the current implementation-state overlay for the locked ModelMix Punch Board. It records observed implementation progress without silently reordering or deleting locked board items.

Authoritative build order and roadmap: [`PUNCH-BOARD.md`](PUNCH-BOARD.md)  
Mission provenance/index: [`MISSION-INDEX.md`](MISSION-INDEX.md)

## Current Repository Checkpoint

Completed and locally verified implementation missions: **001–015**.

Mission **007.5 — PASS** closed the dependency-security compatibility interlock.

Accepted Mission 007.5 implementation commit:

`e018ed06807beda2c11531f065b2d4181c346ca8` — `fix(mcp): migrate inherited MCP integration to MCP 2.x API`

Remote `main` was independently verified to resolve to that commit before this documentation update.

Mission **008** persistence is present on current `main` and passes the current backend suite.

## Mission Ledger

| Mission | Result | Engineering outcome | Evidence location |
|---|---|---|---|
| 001 | PASS | Baseline/architecture spike: inherited verification, streaming/SSE/process/credential ground truth, reuse seams | `001-baseline-architecture-spike.md` |
| 002 | PASS | First real ModelMix streaming slice: optional provider stream contract, ChatGPT OAuth streaming, two independent workers, ordered seat/run SSE | `002-first-streaming-slice.md` |
| 003 | PASS | Bounded process-local event journal, replay/tailing, disconnect-vs-cancel separation, explicit idempotent cancellation | `003-event-journal-reconnect.md` |
| 004 | PASS | First browser observer: independent Worker A/B rendering, reconnect/replay, fixed Send/Stop | `004-first-frontend-observer.md` |
| 005 | PASS | Moderator backend fan-in/synthesis phase, isolation, partial/failure handling, replay/cancellation integration | `005-moderator-backend-phase.md` |
| 006 | PASS | Persistent three-panel cockpit: Worker A / wider Moderator / Worker B, centralized event routing, reconnect and failure UX | `006-three-panel-cockpit-slice.md` |
| 007 | PASS | Searchable configured-model selectors for Worker A/Moderator/Worker B; exact IDs, active-run locking, accessible keyboard behavior | `007-searchable-model-discovery-controls.md` |
| 007.5 | **PASS** | MCP 2.x compatibility migration; security-clean dependency set preserved | `007.5-mcp-2-security-compatibility.md` |
| 008 | **PASS** | Versioned atomic JSON session/run persistence, restart replay reconstruction, and cockpit hydration/deduplication | `008-durable-persistence-cockpit-hydration.md` |
| 009 | **PASS (LOCAL)** | Bounded seat-scoped Worker/Moderator history, failure-partial reuse, hot-swap continuity, and leakage proof | `009-seat-scoped-multi-turn-context.md` |
| 010 | **PASS (LOCAL)** | Seat history character budgets: 4k per message (`MAX_HISTORY_MESSAGE_CHARS`) and 24k per seat (`MAX_HISTORY_TOTAL_CHARS`) with deterministic middle truncation and whole-turn oldest-first eviction | `010-seat-history-budget.md` |
| 010.5 | **PASS (LOCAL)** | Frontend test runner interlock: Vitest + jsdom devDeps, `npm test` non-watch run, existing three test files collected and observed 24/24 pass | `010.5-frontend-test-runner-interlock.md` |
| 011 | **PASS (LOCAL)** | Multi-turn cockpit display: prior runs archived chronologically into per-seat `history`, pure `archiveCurrentRun`, prior turns rendered above the live turn in each panel | `011-multi-turn-cockpit-display.md` |
| 012 | **PASS (LOCAL)** | Session control and prompt plumbing: starting state carries `prompt`/`models`, no placeholder for absent prompts, separate New Session control via `modelSelectorsDisabled` (clears local session key, resets cockpit, preserves models) | `012-session-control-and-prompt-plumbing.md` |
| 013 | **PASS (LOCAL)** | Run and seat timeouts: ModelMix-owned 600s/300s wall-clock bounds (`timeouts.py`), `reason: "timeout"` terminal outcomes reusing `seat_failed`/`moderator_failed`/`run_failed`, honest partial Moderator path for a timed-out seat, and a verified no-late-writes guarantee | `013-run-and-seat-timeouts.md` |
| 014 | **PASS (LOCAL)** | Reachability + test hygiene: real `GET /modelmix` serves the built frontend and the Council sidebar gains a ModelMix nav link (cockpit reachable from a production build); every backend-test `RunRegistry()` writes to an isolated `tmp_path` store instead of the live session directory | `014-reachability-and-test-hygiene.md` |
| 015 | **PASS (LOCAL)** | Telemetry truth layer: events carry wall-clock `ts`; persistence keeps provider `usage`/`finish_reason` (opaque) and `started_at`/`completed_at` on messages — fixing the moderator finish_reason reload bug; the frontend truth layer + `describeUsage` capture everything without rendering; the last polling test is isolated | `015-telemetry-truth-layer.md` |

## Current Verified Product Slice

The accepted implementation through Mission 009 establishes:

- two independent worker seats with no cross-worker answer leakage in the implemented run path;
- one Moderator phase that receives the allowed completed worker outputs;
- true incremental ChatGPT OAuth streaming through the ModelMix streaming contract, with non-streaming fallback support;
- one ordered SSE run feed carrying ModelMix run/seat identity and monotonic sequence information;
- process-local event journal with replay/tailing;
- disconnect separated from explicit cancellation;
- fixed separate Send and Stop controls;
- three-panel browser cockpit: Worker A | wider Moderator | Worker B;
- searchable configured-model selectors for all three seats;
- exact provider/model IDs preserved with no silent substitution;
- selector locking during active/reconnecting/cancelling runs;
- explicit worker/Moderator failure and partial-result handling in the implemented slice.
- durable schema-v1 atomic JSON sessions with canonical seat/audience/role messages and immutable terminal run snapshots;
- cockpit hydration from persisted truth with the durable sequence used as the existing SSE replay cursor.
- bounded multi-turn history keyed only by seat identity, including a Moderator history that excludes prior-turn worker output;
- worker model hot-swaps that preserve the seat's history and failed/cancelled seat partial output when non-empty.
- a deterministic seat-history character budget: each historical message middle-truncated to 4,000 characters and each single-seat assembled history capped at 24,000 characters via whole-turn oldest-first eviction (never an orphan assistant message).
- a runnable frontend test suite: `npm test` executes the existing reducer/API/hydration tests (and configured-model and font-size tests) through Vitest with an observed 24/24 pass; `npm audit` reports 0 vulnerabilities.
- a multi-turn cockpit display: each panel renders its seat's prior turns (compact prompt header above that turn's output) above the live streaming turn, sourced from a `history` array archived from prior session runs.
- honest prompt/model plumbing and a session reset: archived turns carry the real submitted prompt and selected model IDs, absent prompts render nothing (no placeholder), and a separate New Session control (disabled while a run is active) clears the local session key and resets the cockpit while preserving model selections.
- ModelMix-owned wall-clock run and seat timeouts: `timeouts.py` owns `RUN_TIMEOUT_SECONDS = 600` and `SEAT_TIMEOUT_SECONDS = 300`; `run_seat` and `run_moderator` bound their phases and `RunRegistry._run` bounds the whole run, terminating through the existing event types with `reason: "timeout"`, preserving prior deltas, routing a timed-out seat through the honest partial Moderator path, distinguishing explicit cancel (`run_cancelled`) from timeout, and guaranteeing no journal/persistence writes after a run reaches terminal.
- production-build reachability and test hygiene: `GET /modelmix` serves `index.html` from `FRONTEND_DIST_DIR` (404 with a clear message when not built) and the Council sidebar has one visible ModelMix nav link, so the three-panel cockpit is reachable from a built app; every `RunRegistry()` in `backend/tests/` writes to an isolated `tmp_path` store — proven by an unchanged real-data file count (229 before = 229 after) across every previously-polluting test file.

## Mission 007.5 Verification Evidence

Accepted Mission 007.5 results:

- MCP retained at **2.1.1**;
- MCP tests: **146 passed**;
- full backend suite: **458 passed, 5 failed**;
- the five remaining failures were recorded as pre-existing Windows-specific legacy chassis test issues rather than MCP migration regressions;
- Python security audit: **0 known vulnerabilities** across 95 locked dependencies;
- backend import/runtime mount: verified, MCP mounted at `/mcp` with SSE `/mcp/sse`;
- frontend dependency audit: **0 vulnerabilities**;
- frontend production build: **PASS**.

MCP remains an **alpha non-goal** for ModelMix product scope; compatibility maintenance did not promote it into the alpha feature plan.

## Punch Board Progress Mapping

Mission numbers are implementation slices; they are not one-to-one with the 47 locked Punch Board items.

### Satisfied or substantially satisfied

- **1 — Freeze inherited baseline**
- **2 — Run inherited verification**
- **3 — Spike the four unknowns**
- **5 — Lock chassis policy**
- **6 — Create ModelMix-owned backend boundary**
- **8 — Context isolation policy**
- **10 — Define ordered event contract** — every canonical event now carries a wall-clock `ts` in both constructors, additive alongside `seq`/`run_id`/`type` (Mission 015)
- **11 — ModelMix persistence boundary**
- **15 — Non-streaming Mix vertical slice**
- **16 — Prove failure + cancellation**
- **18 — Add normalized provider streaming interface**
- **19 — Multiplex streams into one ordered SSE run feed**
- **20 — Stream Moderator**
- **21 — Build browser-first three-panel cockpit** — reachable from a production build (`GET /modelmix`) and from the Council sidebar (ModelMix nav link) as of Mission 014
- **22 — Bind UI to durable run/session state**
- **23 — Add Stop behavior**

### Partially satisfied — keep open

- **7 — Domain objects:** run/event/seat concepts exist, but the full locked domain/schema-version contract is incomplete.
- **9 — Run state machine:** core active/terminal outcomes exist; complete timeout/retry/state contract remains open. Mission 013 adds honest wall-clock `reason: "timeout"` terminal outcomes for runs, seats, and Moderator.
- **12 — Provider capability matrix:** streaming capability/fallback and configured discovery exist; the full capability matrix remains open.
- **14 — Deterministic mock provider:** current tests use deterministic fakes/mocks, but the full locked failure/timeout/rate-limit fixture matrix remains open.
- **29 — Finalized Mix multi-turn behavior:** seat histories, Moderator history, hot-swap continuity, deterministic context bounding, and completed-turn cockpit display are implemented; retention/delete UX remains open.
- **17 — Spend/runtime guardrails:** explicit Stop, the turn cap, seat-history per-message/per-seat character budgets (Mission 010), and wall-clock run (600s) / seat-Moderator (300s) timeouts (Mission 013) exist, plus persisted `started_at`/`completed_at` timing truth (Mission 015); cost/token ceilings and output warning/hard-cap work remain open.
- **26 — Provider/settings UX:** searchable configured selectors are complete; the visible ModelMix sidebar navigation entry point exists (Mission 014); full alpha provider/settings flow remains open.

### Not yet satisfied / upcoming

- **4 — License and provenance distribution work**
- **13 — Privacy/data-routing rules**
- **24 — Thin top controls**
- **25 — Minimal telemetry — first slice **PARTIAL — Mission 015** (telemetry truth layer landed: wall-clock `ts`, persisted provider-reported `usage`/`finish_reason`/timing, frontend truth capture, `describeUsage`; nothing renders it yet)
- **27 — Solo**
- **28 — Compare**
- **30 — Credential verification in actual packaging model**
- **31 — Local backend hardening**
- **32 — Basic structured observability**
- **33 — Alpha acceptance gate** — enabled by Mission 014 (the cockpit is now reachable from a production build); the acceptance run itself remains open
- **34–47 — Post-alpha roadmap**

## Locked Safeguards Still Open

The Punch Board safeguards remain active requirements:

- provider/account usage warning where authoritative data exists, otherwise clearly labeled ModelMix-tracked/estimated data;
- excessive output-token warning;
- configurable hard output cap at the closest enforceable boundary;
- terminal state must distinguish normal completion, user cancellation, provider/model termination, and ModelMix hard-cap termination.

These safeguards are not to be implemented prematurely in unrelated missions, but they are **not post-alpha by default** and must be wired when the settings/run-control layer reaches them.

## Mission 008 Result

Mission 008 directly closes items 11 and 22 with schema-v1 atomic JSON behind a
ModelMix interface, canonical isolated seat messages, durable run/event cursors,
restart reconstruction, and three-panel hydration. See
`008-durable-persistence-cockpit-hydration.md` for observed commands and scope.

## Mission 009 Result

Mission 009 reads schema-v1 canonical runs/messages without mutation, builds at
most eight prior prompt/answer pairs independently for each seat, and passes
those histories into the existing worker and Moderator provider calls. Prior
worker output is never added to Moderator history, and Moderator output is never
added to either worker history. See `009-seat-scoped-multi-turn-context.md` for
the observed validation output and exact scope.

## Mission 010 Result

Mission 010 replaces the previous 100,000-character-per-message history bound
with a ModelMix-owned per-message budget of 4,000 characters and adds a
24,000-character per-seat assembled-history budget with whole-turn oldest-first
eviction. `history.py` no longer imports a private symbol from `moderator.py`;
current-turn Moderator bounding and the `build_seat_history` contract are
unchanged. See `010-seat-history-budget.md` for the observed validation output.

## Mission 010.5 Result

Mission 010.5 adds Vitest (`^4.1.11`, Vite 7-compatible) and jsdom (`^26.1.0`)
as frontend devDependencies, a non-watch `npm test` (`vitest run`) script, and a
minimal `test` block in the existing `vite.config.js`. The three existing test
files were converted from the `node:test` API to purely an import-path change
(`import { test } from 'vitest'`); no assertions or product code changed. The
observed run: 24/24 pass, 3 files, exit clean. `npm audit`: 0 vulnerabilities.
See `010.5-frontend-test-runner-interlock.md`.

## Mission 011 Result

Mission 011 adds a `history` array of completed prior runs to the frontend seat
state. `hydrateModelMixState` archives every run before the latest one in
chronological order (filtered per run by message `run_id`), the live slots keep
exactly their prior behavior, and a new pure `archiveCurrentRun(state)` resets
the live slots while preserving `sessionId` and appending the outgoing run when
it produced seat content. `ModelMixObserver` archives when a new run starts, and
`TranscriptPane` renders each seat's prior turns above the live turn with the
prior prompt as a compact header. `applyModelMixEvent` is unchanged. See
`011-multi-turn-cockpit-display.md`.

## Mission 012 Result

Mission 012 ensures archived turns show their real prompt during a live session
and adds a session reset control. `send()` stamps the `starting` state with the
submitted `prompt` and the three trimmed selected model IDs so the next
`archiveCurrentRun` captures them. `TranscriptPane` renders the prior-turn prompt
only when present — no `—` placeholder for missing data. A new pure
`startNewSession(state)` returns a fresh cockpit (`createModelMixState()`, empty
`history`) carrying the current model selections forward; `ModelMixObserver`
calls it after removing `modelmix.sessionId` from localStorage. No backend
endpoint is called. The New Session button is a separate fixed control,
disabled only while a run is active via the existing `modelSelectorsDisabled`.
Five tests were added; the existing 30 frontend tests pass unmodified.
`applyModelMixEvent` is unchanged. See
`012-session-control-and-prompt-plumbing.md`.

## Mission 013 Result

Mission 013 delivers ModelMix-owned wall-clock enforcement for runs, seats, and
the Moderator. `backend/modelmix/timeouts.py` owns `SEAT_TIMEOUT_SECONDS = 300`,
`RUN_TIMEOUT_SECONDS = 600`, and a single cumulative-deadline helper
(`aiter_with_deadline`, Python 3.10 compatible). `run_seat` bounds each worker
seat, `run_moderator` bounds the Moderator phase, and `RunRegistry._run` bounds
the whole run — all terminating through the existing `seat_failed` /
`moderator_failed` / `run_failed` events with an explicit `reason: "timeout"`.
A timed-out seat routes through the existing one-failed-worker partial path so
the Moderator still runs with the surviving output (its handoff never treats the
timed-out seat's partial deltas as complete), and the persisted session records
the timed-out seat's partial content with `status: "failed"` and an error naming
the timeout. Explicit cancel is unchanged (`run_cancelled`, never a timeout
label). Because seats only ever push to the local queue and the drain loop is
the single journal writer, no event is written after a run reaches terminal —
verified in both the in-memory journal and the durable document. Existing tests
are untouched: the focused suites (49) and the full backend suite (341 prior
tests, 352 with the 11 new timeout tests) pass, and the frontend trio
(test/build/lint) stays green even though no frontend file changed. See
`013-run-and-seat-timeouts.md`.

## Mission 014 Result

Mission 014 makes the cockpit reachable and stops the tests from polluting live
data. `backend/main.py` registers `GET /modelmix` next to the root handler: it
serves `index.html` from `FRONTEND_DIST_DIR` (registered before the StaticFiles
mount so it wins in production builds) and returns a clear 404 when the frontend
is not built; two route tests in `test_main_preflight.py` cover the 200 and 404
paths. The Council sidebar gains one visible green **ModelMix** link
(`/modelmix`). Every `RunRegistry()` construction in `backend/tests/` now passes
an explicit `AtomicJsonModelMixPersistence` rooted at `tmp_path`: the four
named timeout sites plus the five journal constructors and the shared moderator
`start_run` helper (see the canonical report for the exact grep). The suite-run
disk proof: 229 session files in the real `data/modelmix/sessions/` before and
after re-running all three previously-polluting test files. Two one-line
cosmetics landed: the `multiplex_workers` `event_factory` parameter regained
its signature indentation, and `history.py` regained its trailing newline.
Validation: full backend suite **354 passed** (352 prior + 2 new route tests),
ruff clean, frontend **35 passed** / build green / lint clean. See
`014-reachability-and-test-hygiene.md`.

## Mission 015 Result

Mission 015 is the telemetry truth layer — capture only, no rendering. Both
canonical event constructors now stamp every event with a wall-clock float `ts`
(`journal.append`, the production path, and `events.EventSequencer.create`, the
fallback path). `persistence._apply_event` initializes four new nullable message
fields and fills them: `usage` and `finish_reason` on `seat_completed` /
`moderator_completed` (opaque, un-normalized, only-when-present so a real value
is never clobbered with null); `started_at` from `seat_started` /
`moderator_started`; `completed_at` on every completion, failure, and cancel.
That fixes the confirmed pre-existing bug: a Moderator finish reason used to
vanish on reload because persistence never wrote it. The frontend captures
`usage` / `startedAt` / `completedAt` per seat through the live stream,
hydrated live slots, archived history entries, and `buildHistoryEntry`, and
exports the single provenance vocabulary `describeUsage` (`'authoritative'` /
`'unavailable'`). Mission 015 also fixed the last Mission 014 leftover: the
streaming route test monkeypatches `routes.run_registry` to an isolated
`tmp_path` store. Validation (mission-specified): cleared
`data/modelmix/sessions/*.json`, full backend suite **360 passed** (354 prior +
6 new), and the directory was **empty** afterward — hard proof of no pollution;
frontend **41 passed** (35 prior + 6 new, two existing archive assertions
extended with the new null fields); build green; lint clean; ruff clean. See
`015-telemetry-truth-layer.md`.
