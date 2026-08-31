# ModelMix Punch Board

Locked: 2026-08-27 17:39 CT  
Reconciled through Mission 020: 2026-08-30 CT

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
| 010 | **PASS (LOCAL)** | Seat history owned character budgets: per-message 4k and per-seat 24k deterministic bounding with whole-turn oldest-first eviction |
| 010.5 | **PASS (LOCAL)** | Frontend test runner interlock: Vitest runner wired in; existing frontend tests collected and passing (24/24) |
| 011 | **PASS (LOCAL)** | Multi-turn cockpit display: prior runs archived into per-seat history and rendered above the live turn in each panel |
| 012 | **PASS (LOCAL)** | Session control and prompt plumbing: archived turns carry real prompts/models; separate New Session control that clears local session key and resets the cockpit |
| 013 | **PASS (LOCAL)** | Run and seat timeouts: ModelMix-owned 600s run / 300s seat-Moderator wall-clock bounds enforced with honest `reason: "timeout"` terminal outcomes and a proven no-late-writes guarantee |
| 014 | **PASS (LOCAL)** | Reachability + test hygiene: real `GET /modelmix` serves `index.html` from `FRONTEND_DIST_DIR` so a production build can reach the three-panel cockpit, a visible Council sidebar link navigates there, and every `RunRegistry()` construction in `backend/tests/` now writes to an isolated `tmp_path` store instead of the live `data/modelmix/sessions/` directory |
| 015 | **PASS (LOCAL)** | Telemetry truth layer: events carry wall-clock `ts`; `_apply_event` persists provider-reported `usage`/`finish_reason` (opaque, un-normalized) plus `started_at`/`completed_at`; the frontend truth layer and `describeUsage` capture them without rendering; and the last Mission 014 polling test (streaming route) now uses an isolated persistence |
| 016 | **PASS (LOCAL)** | Compact top bar and panel view controls: one thin persistent top strip (brand, inert `Mode: Mix` label, session status, New Session moved from `.modelmix-actions`, Details-hidden run metadata, Back to Council), and CSS-driven per-panel Collapse/Maximize/Reset view controls that hide panels from layout without ever unmounting them — view state lives only in local component state, untouched by `modelmixState.js` |
| 017 | **PASS (LOCAL)** | Settings shell: a gear entry in the top bar opens an in-app overlay (About renders the real package.json version plus MIT/copyright and text-only AI Counsel attribution; Providers is a read-only Connected/Not-connected list computed from the now-exported `configuredSources` with zero credential values; Defaults saves/clears `modelmix.defaultSeatModels` in localStorage and applies saved seat defaults at initial mount with the exact built-in fallbacks preserved) — frontend-only, no route, no new dependencies |
| 018 | **PASS (LOCAL)** | Telemetry rendering: the cockpit surfaces Mission 015's captured truth as compact per-seat footers (usage labeled `authoritative (provider-reported)` via `describeUsage` showing the provider-reported total token count when present — `total_tokens`/`totalTokenCount` — else the raw key names, or honest `unavailable`, ModelMix-calculated elapsed timing labeled `(calculated)` from `started_at`/`completed_at`, Moderator-only `finish_reason`, raw wall-clock start/end range) rendered only for the live turn — prior-turn archives keep telemetry hidden (explicit follow-up) and cost/pricing wiring stays deliberately out of scope |
| 019 | **PASS (LOCAL)** | Output guardrails, backend enforcement: a new `guardrails.py` owns the provisional char bounds (`WARNING_OUTPUT_THRESHOLD_CHARS = 20_000`, `HARD_OUTPUT_CAP_CHARS = 40_000`, exact-boundary `clip_delta`); `run_seat` and `run_moderator` emit a one-shot `seat_output_warning`/`moderator_output_warning` on the first threshold crossing, then stop consuming the provider stream at the hard cap, truncating deterministically to exactly the cap and terminating as `seat_completed`/`moderator_completed` (NOT failed) with `finish_reason: "modelmix_output_cap"` — honestly distinct from provider termination, failure, timeout, and user cancellation. Non-streaming paths are capped with no warning. Constants are provisional defaults (configurability is a later settings mission); provider-quota usage warnings are explicitly deferred as not honestly buildable — no quota data exists. No changes to `events.py`/`persistence.py`/`journal.py`/`timeouts.py`/`history.py`/`registry.py` or any frontend file |
| 020 | **PASS (LOCAL)** | Configurable output guardrails, backend: `TwoWorkerRequest` gains optional `warning_threshold_chars`/`hard_cap_chars` (`gt=0`); `routes.py::_resolve_guardrail_overrides` defaults omitted fields to the Mission 019 constants, rejects values outside `guardrails.MIN_OUTPUT_CHARS_BOUND = 100` / `MAX_OUTPUT_CHARS_BOUND = 200_000`, and rejects `hard_cap_chars < warning_threshold_chars` — every violation surfaces as a 422 before any provider is resolved or called. The resolved pair rides the exact `registry.start → _run → _run_phase → multiplex_workers/run_moderator` chain (mirroring `seat_timeout`); enforcement logic, event payloads, and the `modelmix_output_cap` finish reason are byte-for-byte unchanged, the frontend sends neither field yet (omitting both is byte-for-byte Mission 019 behavior), and nothing is persisted server-side |

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
- **10 — Define ordered event contract** — every canonical event now carries a wall-clock `ts` in both constructors, additive alongside `seq`/`run_id`/`type` (Mission 015); the cockpit surfaces that timing truth per seat (Mission 018)
- **11 — Define persistence boundary**
- **15 — Build NON-STREAMING Mix vertical slice first**
- **16 — Prove failure + cancellation**
- **18 — Add normalized provider streaming interface**
- **19 — Multiplex streams into one ordered SSE run feed**
- **20 — Stream Moderator**
- **21 — Build browser-first three-panel cockpit** — reachable from a production build (`GET /modelmix`) and from the Council sidebar (ModelMix nav link) as of **Mission 014**
- **22 — Bind UI to durable run/session state**
- **23 — Add Stop behavior**
- **25 — Add minimal telemetry** — state, elapsed time, provider-reported tokens, labeled estimates, reliable per-call cost only (Mission 018 renders honest per-seat usage labels, Moderator finish reason, and calculated timing; cost/pricing wiring and per-historical-turn footers are deferred follow-ups)

### Partially satisfied — keep open

- **7 — Define domain objects:** run/event/seat concepts exist; full locked domain/schema-version contract remains incomplete.
- **9 — Define run state machine:** core active/terminal outcomes exist; complete timeout/retry/state contract remains open. Mission 013 adds honest wall-clock `reason: "timeout"` outcomes for runs, seats, and Moderator.
- **12 — Define provider capability matrix:** streaming/fallback and configured discovery exist; full matrix remains open.
- **14 — Build deterministic mock provider:** deterministic fakes/mocks support current tests; full failure/timeout/rate-limit fixture matrix remains open.
- **17 — Add basic spend/runtime guardrails:** Stop, turn cap, wall-clock run (600s) / seat-Moderator (300s) timeouts (Mission 013), seat-history per-message/per-seat character budgets (Mission 010 partial progress on context bounding), and — new in Mission 019 — a hard output cap plus one-shot output warning for every worker seat and the Moderator with an honest `modelmix_output_cap` terminal outcome, made configurable per request in Mission 020 (`warning_threshold_chars`/`hard_cap_chars`, bounded 100–200_000 chars, validated to 422 before any provider call); cost/token ceilings, frontend controls, and local-preference wiring remain open.
- **29 — Finalize Mix multi-turn session behavior:** seat-scoped Worker/Moderator history, bounding, failure-partial reuse, hot-swap continuity, completed-turn cockpit display, and New Session reset are implemented; retention/delete UX remains open.
- **26 — Add provider/settings UX sufficient for alpha:** searchable configured selectors are complete; the visible ModelMix navigation entry point in the Council sidebar exists (Mission 014); the cockpit Settings surface is now a real entry (Mission 017) with read-only provider status from the exported `configuredSources`; full alpha provider/settings flow remains open.

### Open / upcoming

- **4 — Lock license and provenance** — **PARTIAL — MISSION 017** (the cockpit About section now surfaces the MIT license, the copyright holder, the real version, the text-only AI Counsel attribution, and the repo URL; `OPEN_SOURCE_CREDITS.md`, inherited-module provenance, and the shipped dependency-license inventory remain open)
- **13 — Define privacy/data-routing rules**
- **24 — Build thin top controls** — **PARTIAL — MISSIONS 012/016/017** (Mission 012: separate New Session control; Mission 016: one compact persistent top strip — brand, inert `Mode: Mix` label, session status, moved New Session, Details-hidden debug line, Back to Council — and CSS-driven panel Collapse/Maximize/Reset; Mission 017: the Settings surface is now a real gear entry opening the Settings overlay; only an interactive Mode selector remains open)
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

Run/document backend tests, frontend tests/build, existing lint/type checks, practical dependency/security scan, and inherited app launch. Mission 010.5 wired a Vitest runner and brought the existing frontend test files to a real 24/24 observed pass; `npm audit` reports 0 vulnerabilities.

### 3. Spike the four unknowns — **SATISFIED**

Verify provider streaming, SSE/reconnect, process-local run state, and credential behavior from actual code.

## PHASE 1 — Own the Product Boundary

### 4. Lock license and provenance — **PARTIAL — MISSION 017**

Preserve MIT/copyright, add `OPEN_SOURCE_CREDITS.md`, visible credit, inherited-module provenance, and shipped dependency-license inventory. Mission 017 adds the visible credit and copyright/license surface in the cockpit About section; the remaining provenance/inventory artifacts stay open.

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

Created, dispatching, workers_running, moderating, completed, partially_completed, cancelled, failed, timed_out; define partial Moderator policy, Stop, persistence, retries, and UI terminal states. **Mission 013** adds the wall-clock `timed_out` outcome: `run_failed` / `seat_failed` / `moderator_failed` with `reason: "timeout"` through the existing event seam; retries remain open.

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

One/both worker failure, Moderator failure, timeout/rate limit/cancellation/partial outcomes modeled honestly. **Mission 013** proves run/seat/Moderator timeouts share the same loop and cancellation machinery as failure and explicit cancel, with a no-late-writes guarantee verified in both the journal and durable session. Persisted restart case remains tied to item 11.

### 17. Add basic spend/runtime guardrails — **PARTIAL**

Max workers, run timeout, Stop, seat-history character budgets (Mission 010 partial), optional cost/token ceiling, no automatic provider/model substitution without permission. **Mission 013** adds the ModelMix-owned wall-clock bounds: `RUN_TIMEOUT_SECONDS = 600` enforced by `RunRegistry`, `SEAT_TIMEOUT_SECONDS = 300` enforced per worker seat and for the Moderator phase, with honest `reason: "timeout"` terminal events. **Mission 019** enforces the output guardrails behind module constants (`guardrails.py`): `WARNING_OUTPUT_THRESHOLD_CHARS = 20_000` and `HARD_OUTPUT_CAP_CHARS = 40_000`, with a one-shot `seat_output_warning`/`moderator_output_warning` on first crossing and an exact-cap deterministic truncation that stops consuming the stream and terminates as `seat_completed`/`moderator_completed` with `finish_reason: "modelmix_output_cap"` (never `seat_failed`, never colliding with provider reasons). **Mission 020** makes both
thresholds configurable per request through `POST /api/modelmix/runs/stream`:
optional `warning_threshold_chars`/`hard_cap_chars` on `TwoWorkerRequest`,
defaulted to the module constants when omitted, bounded to
`guardrails.MIN_OUTPUT_CHARS_BOUND = 100` / `MAX_OUTPUT_CHARS_BOUND = 200_000`,
cross-checked (`hard_cap_chars >= warning_threshold_chars`), and rejected as
422 **before** any provider is resolved or called. The pair rides the exact
`seat_timeout` chain (`registry.start → _run → _run_phase →
multiplex_workers/run_moderator`); enforcement logic and event payloads are
unchanged. The provider/account usage warning remains open because no
authoritative quota data exists to compare against; controls in the Settings
UI (with local-preference persistence) are the remaining item-17 work.

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

### 24. Build thin top controls — **PARTIAL — MISSIONS 012/016/017**

ModelMix, Mode, Models, Session, Settings, compact overflow as needed. No dead controls. Mission 012 delivered the separate New Session control (disabled while a run is active) and cleared the local session key on activation. Mission 016 delivered the compact persistent top strip (brand, inert `Mode: Mix` label, session status, New Session moved up out of the composer, `Run`/`Last sequence` behind a Details disclosure that is off by default, Back to Council) and CSS-driven per-panel Collapse/Maximize/Reset view controls that hide panels from layout without unmounting them. Mission 017 delivers the Settings surface as a gear entry opening an in-app overlay (About / Providers / Defaults). An interactive Mode selector (Solo/Compare depend on items 27/28) remains open.

### 25. Add minimal telemetry — **SUBSTANTIALLY SATISFIED — MISSIONS 015/018**

State, elapsed time, provider-reported tokens where available, labeled estimates, reliable per-call cost only. Confidence colors represent data quality, not danger.

Mission 015 landed the truth layer: wall-clock `ts`, persisted provider-reported `usage`/`finish_reason`, and `started_at`/`completed_at` timing. Mission 018 renders it honestly in the cockpit: compact per-seat footers for the live turn only — usage labeled `authoritative (provider-reported)` (via the `describeUsage` vocabulary) showing the provider-reported total token count (`total_tokens`/`totalTokenCount`, formatted `<n> tokens`) when it is a finite number, else the raw provider key names as fallback, or honest `unavailable`, elapsed time labeled `(calculated)`, the Moderator-only `finish_reason`, and the raw start/end range. No fabricated estimates, no fake normalized percentages; each seat's provider-reported usage stays opaque and un-normalized. **Deferred, explicitly noted follow-ups:** per-historical-turn telemetry footers (archived turns currently render zero footers even though the data is captured) and reliable per-call cost/pricing wiring (deliberately out of scope here — cost fields are never guessed or displayed).

### 26. Add provider/settings UX sufficient for alpha — **PARTIAL**

Mission 007 completed searchable configured selectors. Mission 017 adds the cockpit Settings overlay with read-only provider status (derived from the now-exported `configuredSources`) and saved default seat models. Credential/endpoint/settings entry flow remains in the Council route and remains open.

## PHASE 6 — Conversation Modes and Persistence UX

### 27. Add Solo — **OPEN**

### 28. Add Compare — **OPEN**

### 29. Finalize Mix multi-turn session behavior — **PARTIAL — MISSIONS 009/011/012**

Independent bounded seat histories, Moderator history, hot-swap continuity, and context without cross-seat leakage are implemented. Mission 011 displays completed prior turns above the live turn in each cockpit panel; Mission 012 makes archived turns carry their real prompt/models and adds the New Session reset control. Retention/delete basics remain open.

## PHASE 7 — Security Hardening for Alpha

### 30. Verify credential storage in actual packaging model — **OPEN**

### 31. Harden local backend boundary — **OPEN**

### 32. Add basic structured observability — **OPEN**

## ALPHA GATE

### 33. Alpha acceptance test — **ENABLER — MISSION 014**

Launch; three panels; configure A/B/Moderator; stream both workers; stream Moderator; cancel; survive worker failure; reopen session; multi-turn isolation; honest telemetry; no credential leak.

Mission 014 removed the reachability blocker: a production build now serves the
cockpit at `/modelmix` and offers a visible Council sidebar link, so the alpha
acceptance launch can actually begin from a built app rather than a dev server.

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

The output guardrails are now enforced for real output (Mission 019) and the
two thresholds are configurable per request (Mission 020): every worker seat
and the Moderator carry a hard cap (default 40k chars, exact deterministic
truncation via `guardrails.py`, terminal `finish_reason: "modelmix_output_cap"`,
honestly distinct from normal completion, user cancellation, provider/model
termination, failure, and timeout) plus a one-shot output warning (default 20k
chars, `seat_output_warning`/`moderator_output_warning`). The per-request
override accepts `warning_threshold_chars`/`hard_cap_chars` (bounded
100–200_000 and cross-checked) and rejects invalid values with a 422 before
any provider call; a settings/local-preference UI mission is what makes the
chosen values feel persistent to the user, and no running value is ever
persisted server-side. The provider/account usage warning stays explicitly open
because no authoritative quota/rate-limit data exists anywhere to compare
against. Mission 015's telemetry truth layer is rendered as compact per-seat
footers (Mission 018) with no telemetry dashboard, usage kept opaque and
un-normalized, and no fabricated estimates; two follow-ups remain explicitly
deferred: per-historical-turn telemetry footers and reliable per-call cost
wiring. Within item 24, only the interactive Mode selector (Solo/Compare depend
on items 27/28) remains open; the Settings surface shipped as the Mission 017
gear entry.
