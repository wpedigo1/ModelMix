# ModelMix Punch Board

Locked: 2026-08-27 17:39 CT  
Reconciled through Mission 009: 2026-08-29 CT

Status: **BUILD PLAN LOCKED FOR ALPHA**

This is the authoritative repository copy of the ModelMix build order and project roadmap. Mission numbers are implementation slices; they are not one-to-one with Punch Board items.

Changes to this order require a concrete technical blocker or newly verified fact, not preference or curiosity.

## Mission Ledger

| Mission | Result | Engineering outcome |
|---|---|---|
| 001 | PASS | Baseline/architecture spike; inherited verification and streaming/SSE/process/credential ground truth |
| 002 | PASS | Provider stream contract, ChatGPT OAuth streaming, two independent workers, ordered seat/run SSE |
| 003 | PASS | Process-local event journal, replay/tailing, disconnect-vs-cancel separation, explicit cancellation |
| 004 | PASS | Browser observer, independent Worker A/B rendering, reconnect/replay, fixed Send/Stop |
| 005 | PASS | Moderator backend fan-in/synthesis, isolation, partial/failure handling |
| 006 | PASS | Three-panel Worker A / wider Moderator / Worker B cockpit |
| 007 | PASS | Searchable configured-model selectors, exact IDs, active-run locking, accessible keyboard behavior |
| 007.5 | **PASS** | MCP 2.x security/compatibility interlock closed; clean dependency set retained |
| 008 | **PASS** | Versioned atomic JSON persistence, restart reconstruction, and cockpit hydration on `main` |
| 009 | **PASS (LOCAL)** | Seat-scoped bounded multi-turn Worker/Moderator history with hot-swap continuity and leakage tests |

**Mission 008 is present on `main` and its persistence tests pass.**

### Mission 007.5 Interlock Result

Mission 007.5 did **not** reorder the locked 47-item build plan. It was a bounded remediation interlock created from an observed repository compatibility blocker after dependency-security cleanup.

Accepted Mission 007.5 implementation commit:

`e018ed06807beda2c11531f065b2d4181c346ca8` — `fix(mcp): migrate inherited MCP integration to MCP 2.x API`

Observed accepted results:

- MCP retained at **2.1.1**;
- MCP tests: **146 passed**;
- full backend suite: **458 passed, 5 failed**;
- five remaining failures recorded as pre-existing Windows-specific legacy chassis test issues, not MCP migration regressions;
- Python dependency audit: **0 known vulnerabilities** across 95 locked dependencies;
- frontend dependency audit: **0 vulnerabilities**;
- frontend production build: **PASS**;
- backend import/runtime mount verified at `/mcp` with SSE `/mcp/sse`.

MCP remains an **alpha non-goal** as a ModelMix product capability; compatibility maintenance did not promote it into alpha scope.

## Progress Against the Locked Board

### Satisfied or substantially satisfied

- **1 — Freeze inherited baseline**
- **2 — Run inherited verification**
- **3 — Spike the four unknowns**
- **5 — Lock chassis policy**
- **6 — Create ModelMix-owned backend boundary**
- **8 — Define context isolation policy**
- **10 — Define ordered event contract**
- **11 — Define persistence boundary**
- **15 — Build NON-STREAMING Mix vertical slice first**
- **16 — Prove failure + cancellation**
- **18 — Add normalized provider streaming interface**
- **19 — Multiplex streams into one ordered SSE run feed**
- **20 — Stream Moderator**
- **21 — Build browser-first three-panel cockpit**
- **22 — Bind UI to durable run/session state**
- **23 — Add Stop behavior**

### Partially satisfied — keep open

- **7 — Define domain objects:** run/event/seat concepts exist; full locked domain/schema-version contract remains incomplete.
- **9 — Define run state machine:** core active/terminal outcomes exist; complete timeout/retry/state contract remains open.
- **12 — Define provider capability matrix:** streaming/fallback and configured discovery exist; full matrix remains open.
- **14 — Build deterministic mock provider:** deterministic fakes/mocks support current tests; full failure/timeout/rate-limit fixture matrix remains open.
- **17 — Add basic spend/runtime guardrails:** Stop and some bounding hooks exist; timeout/cost-token ceilings/output warning/hard cap remain open.
- **29 — Finalize Mix multi-turn session behavior:** seat-scoped Worker/Moderator history, bounding, failure-partial reuse, and hot-swap continuity are implemented; retention/delete UX remains open.
- **26 — Add provider/settings UX sufficient for alpha:** searchable configured selectors are complete; full alpha provider/settings flow remains open.

### Open / upcoming

- **4 — Lock license and provenance**
- **13 — Define privacy/data-routing rules**
- **24 — Build thin top controls**
- **25 — Add minimal telemetry**
- **27 — Add Solo**
- **28 — Add Compare**
- **30 — Verify credential storage in actual packaging model**
- **31 — Harden local backend boundary**
- **32 — Add basic structured observability**
- **33 — Alpha acceptance test**
- **34–47 — Post-alpha work**

---

# Locked 47-Item Build Order

## PHASE 0 — Establish Ground Truth

### 1. Freeze inherited baseline — **SUBSTANTIALLY SATISFIED**

Record ModelMix baseline commit, AI Counsel upstream revision, dependency lockfile state, and inherited provenance.

### 2. Run inherited verification — **SUBSTANTIALLY SATISFIED**

Run/document backend tests, frontend tests/build, existing lint/type checks, practical dependency/security scan, and inherited app launch.

### 3. Spike the four unknowns — **SATISFIED**

Verify provider streaming, SSE/reconnect, process-local run state, and credential behavior from actual code.

## PHASE 1 — Own the Product Boundary

### 4. Lock license and provenance — **OPEN**

Preserve MIT/copyright, add `OPEN_SOURCE_CREDITS.md`, visible credit, inherited-module provenance, and shipped dependency-license inventory.

### 5. Lock chassis policy — **SUBSTANTIALLY SATISFIED**

Keep the current ModelMix repo. Upstream is a reference/selective-fix source, not a live product parent. ModelMix owns orchestration/UI.

### 6. Create ModelMix-owned backend boundary — **SUBSTANTIALLY SATISFIED**

Dedicated ModelMix domain/session/run/seat/Moderator/orchestration/event/persistence/capability/telemetry seams.

## PHASE 2 — Define the Core Contracts

### 7. Define domain objects — **PARTIAL**

Session, Run, Seat, Message, Moderator, Provider/Model reference, ProviderCapabilities, UsageRecord, RunEvent, Artifact/reference, Error/terminal result, with schema versions.

### 8. Define context isolation policy — **SATISFIED — MISSION 009**

Workers see only user/authorized shared context plus their own seat history. Moderator sees authorized user/context and current worker outputs. Seat history belongs to the seat, not the selected model.

### 9. Define run state machine — **PARTIAL**

Created, dispatching, workers_running, moderating, completed, partially_completed, cancelled, failed, timed_out; define partial Moderator policy, Stop, persistence, retries, and UI terminal states.

### 10. Define ordered event contract — **SATISFIED**

SSE events carry `run_id`, monotonic `seq`, actor/seat identity, type, and payload/timestamp; reconnect uses replay cursor.

### 11. Define persistence boundary — **SATISFIED — MISSION 008**

Keep JSON for alpha behind a ModelMix interface; add schema versioning and atomic writes; store canonical messages with seat/audience/role metadata; store immutable run snapshots; preserve partial results; **do not migrate to SQLite now**.

**PASS:** restart reconstructs a session without relying on in-memory run state.

### 12. Define provider capability matrix — **PARTIAL**

Track only capabilities needed to prevent false UI promises: chat, streaming, known limits, usage, inherited tool/vision/file support, auth, local/remote, cancellation, pricing support.

### 13. Define privacy/data-routing rules — **OPEN**

Document what each provider may receive; credentials are references; no raw secrets in logs/frontend/session JSON; cross-provider forwarding is intelligible.

## PHASE 3 — Build the Smallest Real Engine

### 14. Build deterministic mock provider — **PARTIAL**

Support normal response, stream, slow stream, failure, timeout, rate limit, cancellation, malformed event, missing usage, duplicate/out-of-order fixtures.

### 15. Build NON-STREAMING Mix vertical slice first — **SATISFIED — MISSION 009**

Two isolated workers → complete bounded outputs → Moderator → persisted session. Mission 009 adds bounded seat-scoped continuation while preserving the same isolated worker and Moderator flow.

### 16. Prove failure + cancellation with the same loop — **SUBSTANTIALLY SATISFIED**

One/both worker failure, Moderator failure, timeout/rate limit/cancellation/partial outcomes modeled honestly. Persisted restart case remains tied to item 11.

### 17. Add basic spend/runtime guardrails — **PARTIAL**

Max workers, run timeout, Stop, optional cost/token ceiling, no automatic provider/model substitution without permission.

## PHASE 4 — Streaming

### 18. Add normalized provider streaming interface — **SATISFIED**

### 19. Multiplex streams into one ordered SSE run feed — **SATISFIED**

### 20. Stream Moderator — **SATISFIED**

## PHASE 5 — Build the Actual ModelMix UI

### 21. Build browser-first three-panel cockpit — **SATISFIED**

Worker A | wider Moderator | Worker B; full-height chat surfaces; independent scrolling; clear states.

### 22. Bind UI to durable run/session state — **SATISFIED — MISSION 008**

Hydrate from persisted canonical messages, subscribe to existing events, replay from the durable last sequence, and suppress duplicates. Reload/reopen and backend restart reconstruction are covered by Mission 008.

### 23. Add Stop behavior — **SATISFIED**

One visible Stop action; separate fixed Send and Stop controls; honest partial-state display.

### 24. Build thin top controls — **OPEN**

ModelMix, Mode, Models, Session, Settings, compact overflow as needed. No dead controls.

### 25. Add minimal telemetry — **OPEN**

State, elapsed time, provider-reported tokens where available, labeled estimates, reliable per-call cost only. Confidence colors represent data quality, not danger.

### 26. Add provider/settings UX sufficient for alpha — **PARTIAL**

Mission 007 completed searchable configured selectors. Provider credential/endpoint/settings flow remains open.

## PHASE 6 — Conversation Modes and Persistence UX

### 27. Add Solo — **OPEN**

### 28. Add Compare — **OPEN**

### 29. Finalize Mix multi-turn session behavior — **PARTIAL — MISSION 009**

Independent bounded seat histories, Moderator history, hot-swap continuity, and context without cross-seat leakage are implemented. Reopen remains covered by durable session identity; retention/delete basics remain open.

## PHASE 7 — Security Hardening for Alpha

### 30. Verify credential storage in actual packaging model — **OPEN**

### 31. Harden local backend boundary — **OPEN**

### 32. Add basic structured observability — **OPEN**

## ALPHA GATE

### 33. Alpha acceptance test — **OPEN**

Launch; three panels; configure A/B/Moderator; stream both workers; stream Moderator; cancel; survive worker failure; reopen session; multi-turn isolation; honest telemetry; no credential leak.

**Nothing below this line may delay the alpha gate.**

## PHASE 8 — Desktop Packaging

### 34. Package single-window app with Tauri 2 — **OPEN**

### 35. Measure before optimizing — **OPEN**

## PHASE 9 — Research and Workspace Features

### 36. Add Moderator-only web/document access first — **OPEN**

### 37. Add workspace/context permissions gradually — **OPEN**

## PHASE 10 — Advanced Telemetry

### 38. Add provider-account usage only where real — **OPEN**

## PHASE 11 — Detachable Windows

### 39. Define authoritative shared-state owner — **OPEN**

### 40. Add one pop-out panel — **OPEN**

### 41. Generalize detach/re-dock — **OPEN**

## PHASE 12 — Advanced Modes

### 42. Revisit compact handoffs — **OPEN**

### 43. Deep Mix — **OPEN**

## PHASE 13 — Android

### 44. Design mobile interaction model separately — **OPEN**

### 45. Validate Tauri Android packaging — **OPEN**

## PHASE 14 — Cleanup and Upstream Maintenance

### 46. Prune dead Council/Advisor/debate code — **OPEN**

### 47. Establish selective upstream watch — **OPEN**

---

# Explicit Alpha Non-Goals

Detachable windows; Android; Deep Mix; 5-worker cockpit; mandatory structured compact handoffs; MCP; connected-service actions; advanced workspace permission matrix; account-wide quota dashboard; SQLite migration; formal debate; autonomous agent planning; automatic provider rerouting; elaborate personas; giant evidence/conflict dashboard; elaborate desktop updater polish.

# Locked Architectural Calls

1. Repository: keep current ModelMix repo.
2. Upstream: reference/selective-fix source, not live product parent.
3. Default: Worker A + Moderator + Worker B.
4. Workers are independent witnesses.
5. Transport: SSE.
6. Streaming: multiplexed ordered run feed.
7. Context: seat-scoped projections, not one shared transcript.
8. Moderator MVP input: complete bounded worker outputs.
9. Persistence MVP: versioned atomic JSON behind interface.
10. Backend alpha: single worker/process unless run-state design changes.
11. UI alpha: single-window browser/React cockpit.
12. Desktop shell: Tauri 2 after browser alpha.
13. Pop-outs: post-alpha.
14. Android: post-Windows, separate UX.
15. Telemetry MVP: per-run/per-call truth first.
16. Security: preserve verified inherited protections and harden desktop-local boundary.
17. No hidden chain-of-thought.
18. No Stage 2 peer ranking/debate.
19. No automatic cross-worker context leakage.
20. Simple first. Power when requested.

## UX Lock — 2026-08-27 17:35 CT

Three full-height conversation surfaces. Thin chrome.

Send and Stop are separate fixed adjacent controls:
- idle/composing: Send active, Stop disabled;
- running: Send disabled, Stop active;
- never morph Send into Stop at the same cursor location.

## Feature Lock — Usage Warnings and Output Guardrails

### Provider / Account Usage Warning

Toggle; configurable warning percentage; authoritative percentage only when truly available; otherwise labeled ModelMix-tracked/estimated; warn once; soft by default.

### Excessive Output Token Warning

Separate toggle; configurable absolute and/or known-max percentage threshold; warn once; estimates labeled.

### Hard Output Cap

Separate toggle; configurable threshold; stop at cap or closest enforceable boundary.

Terminal state must distinguish:
- normal completion;
- user cancellation;
- provider/model termination;
- ModelMix hard-cap termination.

Hard cap is **not post-alpha by default**. Wire it when settings/run-control reaches output limits.

## Immediate Next Engineering Gap

Mission 009 completes seat-scoped multi-turn context. Remaining alpha gaps stay ordered by this Punch Board; Mission 009 does not add retention/delete UX, telemetry, guardrails, Solo, or Compare.
