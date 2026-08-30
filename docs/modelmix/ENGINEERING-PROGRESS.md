# ModelMix Engineering Progress

Updated: 2026-08-29 CT

This is the current implementation-state overlay for the locked ModelMix Punch Board. It records observed implementation progress without silently reordering or deleting locked board items.

Authoritative build order and roadmap: [`PUNCH-BOARD.md`](PUNCH-BOARD.md)  
Mission provenance/index: [`MISSION-INDEX.md`](MISSION-INDEX.md)

## Current Repository Checkpoint

Completed and locally verified implementation missions: **001–010**.

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
- **10 — Define ordered event contract**
- **11 — ModelMix persistence boundary**
- **15 — Non-streaming Mix vertical slice**
- **16 — Prove failure + cancellation**
- **18 — Add normalized provider streaming interface**
- **19 — Multiplex streams into one ordered SSE run feed**
- **20 — Stream Moderator**
- **21 — Build browser-first three-panel cockpit**
- **22 — Bind UI to durable run/session state**
- **23 — Add Stop behavior**

### Partially satisfied — keep open

- **7 — Domain objects:** run/event/seat concepts exist, but the full locked domain/schema-version contract is incomplete.
- **9 — Run state machine:** core active/terminal outcomes exist; complete timeout/retry/state contract remains open.
- **12 — Provider capability matrix:** streaming capability/fallback and configured discovery exist; the full capability matrix remains open.
- **14 — Deterministic mock provider:** current tests use deterministic fakes/mocks, but the full locked failure/timeout/rate-limit fixture matrix remains open.
- **29 — Finalized Mix multi-turn behavior:** seat histories, Moderator history, hot-swap continuity, and deterministic context bounding are implemented; retention/delete UX remains open.
- **17 — Spend/runtime guardrails:** explicit Stop, the turn cap, and seat-history per-message/per-seat character budgets exist (Mission 010 partial progress on context/spend bounding); timeout/cost-token ceilings and output warning/hard-cap work remain open.
- **26 — Provider/settings UX:** searchable configured selectors are complete; full alpha provider/settings flow remains open.

### Not yet satisfied / upcoming

- **4 — License and provenance distribution work**
- **13 — Privacy/data-routing rules**
- **24 — Thin top controls**
- **25 — Minimal telemetry**
- **27 — Solo**
- **28 — Compare**
- **30 — Credential verification in actual packaging model**
- **31 — Local backend hardening**
- **32 — Basic structured observability**
- **33 — Alpha acceptance gate**
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
