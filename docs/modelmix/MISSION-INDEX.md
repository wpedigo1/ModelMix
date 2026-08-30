# ModelMix Mission Record Index

Updated: 2026-08-30 CT

This index reconciles completed implementation missions with the canonical engineering records in this repository.

Authoritative build order and roadmap: [`PUNCH-BOARD.md`](PUNCH-BOARD.md)  
Current implementation overlay: [`ENGINEERING-PROGRESS.md`](ENGINEERING-PROGRESS.md)

Mission prompts and worker responses may also exist in the ModelMix project Library. Repo mission reports are the canonical engineering records for state accepted into current `main`; Library copies preserve dispatch/response history and additional project provenance.

| Mission | Prompt owner / route at dispatch | Result | Canonical repo report |
|---|---|---|---|
| 001 | Claude Code | PASS | `001-baseline-architecture-spike.md` |
| 002 | Codex | PASS | `002-first-streaming-slice.md` |
| 003 | Codex | PASS | `003-event-journal-reconnect.md` |
| 004 | Codex | PASS | `004-first-frontend-observer.md` |
| 005 | Codex | PASS | `005-moderator-backend-phase.md` |
| 006 | Codex | PASS | `006-three-panel-cockpit-slice.md` |
| 007 | Codex-labeled historical prompt; final implementation/verification completed through ChatGPT Work after repository recovery | PASS | `007-searchable-model-discovery-controls.md` |
| 007.5 | Codex | **PASS** | `007.5-mcp-2-security-compatibility.md` |
| 008 | Codex isolated checkout | **PASS** | `008-durable-persistence-cockpit-hydration.md`; accepted on `main` |
| 009 | Codex | **PASS (LOCAL)** | `009-seat-scoped-multi-turn-context.md` |
| 010 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `010-seat-history-budget.md` |
| 010.5 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `010.5-frontend-test-runner-interlock.md` |
| 011 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `011-multi-turn-cockpit-display.md` |
| 012 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `012-session-control-and-prompt-plumbing.md` |
| 013 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `013-run-and-seat-timeouts.md` |
| 014 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `014-reachability-and-test-hygiene.md` |
| 015 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `015-telemetry-truth-layer.md` |
| 016 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `016-compact-top-bar-and-panel-controls.md` |
| 017 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `017-settings-shell.md` |
| 018 | Big Pickle (OpenCode Zen) | **PASS (LOCAL)** | `018-telemetry-rendering.md` |

## Mission 007 Provenance Clarification

The final Mission 007 implementation/verification result was produced through **ChatGPT Work** after earlier Codex/repository recovery work. Do not attribute the accepted final Mission 007 result to GLM-5.3.

Accepted Mission 007 implementation commit recorded in the project evidence:

`b10be680c437293d104727ee7f6c26f7e698f79b` — `feat: add ModelMix model discovery selectors`

## Mission 007.5 Security Interlock — CLOSED

Mission 007.5 was a bounded remediation mission inserted between completed Mission 007 and planned Mission 008. It did **not** reorder the locked 47-item Punch Board and did not promote MCP into alpha product scope.

Accepted result on remote `main`:

`e018ed06807beda2c11531f065b2d4181c346ca8` — `fix(mcp): migrate inherited MCP integration to MCP 2.x API`

Verified results recorded by the mission:

- MCP retained at **2.1.1**;
- MCP tests: **146 passed**;
- full backend suite: **458 passed, 5 failed**;
- the five remaining failures were recorded as pre-existing Windows-specific legacy chassis test issues, not MCP migration regressions;
- Python security audit: **0 known vulnerabilities** across 95 locked dependencies;
- backend import/runtime mount verified with MCP mounted at `/mcp` and SSE at `/mcp/sse`;
- frontend dependency audit: **0 vulnerabilities**;
- frontend production build: **PASS**.

Remote `main` was independently verified to resolve to `e018ed06807beda2c11531f065b2d4181c346ca8` before this bookkeeping update.

## Mission 008 Result

**Mission 008 is implemented on current `main` and its persistence behavior passes the current backend suite.**

Objective:

**ModelMix-owned durable session/run persistence plus cockpit hydration using versioned atomic JSON, preserving completed/partial seat state and the existing SSE replay contract.**

Mission 008 corresponds primarily to Punch Board items **11** and **22** and
adds schema-v1 atomic JSON persistence plus durable cockpit hydration.

## Mission 009 Result

**Mission 009 is implemented and verified locally.**

Mission 009 adds bounded, seat-scoped multi-turn history for Worker A, Worker B,
and Moderator. It closes Punch Board items **8** and **15**, partially satisfies
item **29**, preserves history across model hot-swaps, and proves by sentinel
tests that no prior Worker or Moderator content leaks into another worker seat.

## Mission 010 Result

**Mission 010 is implemented and verified locally.**

Mission 010 gives seat history its own owned character budgets: each historical
message is deterministically middle-truncated at 4,000 characters and the
assembled single-seat history is capped at 24,000 characters with whole-turn
oldest-first eviction. It makes partial progress on Punch Board item **17**
(context/spend bounding) while leaving `moderator.py`, `registry.py`, and
`orchestrator.py` untouched.

## Mission 010.5 Result

**Mission 010.5 is implemented and verified locally.**

Mission 010.5 wires Vitest (`npm test` non-watch) and jsdom into the frontend,
adds a `test` block to the existing `vite.config.js`, and brings the three
existing frontend test files to an observed **24/24 pass** through a real
runner. It strengthens Punch Board item **2** (verification) and enables
follow-on work for item **22** (UI to durable run/session state).

## Mission 011 Result

**Mission 011 is implemented and verified locally.**

Mission 011 displays the full per-seat conversation across turns in the cockpit:
`createModelMixState` gains `history: []`, `hydrateModelMixState` archives every
prior run chronologically, `archiveCurrentRun` (pure) moves the outgoing run into
history when it produced seat content, and each `TranscriptPane` renders its
seat's prior turns above the live turn. It advances Punch Board item **22** and
makes partial progress on item **29**.

## Mission 012 Result

**Mission 012 is implemented and verified locally.**

Mission 012 makes archived turns honest and gives the cockpit a session reset
control: the state produced when starting a run carries the submitted `prompt`
and the three selected model IDs so the next archive captures them; the prior
prompt renderer no longer substitutes a `—` placeholder for a missing prompt; and
a separate New Session control clears the `modelmix.sessionId` local key, resets
the cockpit to `createModelMixState()` (empty `history`), and preserves model
selections — without touching any backend endpoint. New Session is disabled
while a run is active via the existing `modelSelectorsDisabled` predicate. It is
the first slice of Punch Board item **24** and makes further partial progress on
item **29**.

## Mission 013 Result

**Mission 013 is implemented and verified locally.**

Mission 013 gives ModelMix its own wall-clock run and seat enforcement:
`backend/modelmix/timeouts.py` owns `RUN_TIMEOUT_SECONDS = 600` and
`SEAT_TIMEOUT_SECONDS = 300` plus one cumulative-deadline helper. `run_seat`
bounds each worker seat, `run_moderator` bounds the Moderator phase, and
`RunRegistry._run` bounds the whole run — all terminating through the existing
`seat_failed` / `moderator_failed` / `run_failed` events with an explicit
`reason: "timeout"`. A timed-out seat still routes through the one-failed-worker
partial path so the Moderator runs with the surviving output; explicit cancel
still yields `run_cancelled` and is never labeled a timeout; and no event is
written to the journal or durable session after a run reaches terminal — proven
for both timeout and cancel paths. It makes partial progress on Punch Board items
**17** and **9** and strengthens item **16**.

## Mission 014 Result

**Mission 014 is implemented and verified locally.**

Mission 014 adds a real `GET /modelmix` route (serving `index.html` from
`FRONTEND_DIST_DIR`) and a visible Council sidebar navigation link, making
the three-panel cockpit reachable from a production build. It fixes every
`RunRegistry()` construction in `backend/tests/` to write to an isolated
`tmp_path` store, eliminating the test-suite's long-standing pollution of the
live `data/modelmix/sessions/` directory. The grep that found all sites is
reported in the canonical mission report. It corresponds to Punch Board items
**21** (fix: production-build reachability), **26** (partial: visible navigation
entry), and **33** (enabler: acceptance run can now start from a built app).

## Mission 015 Result

**Mission 015 is implemented and verified locally.**

Mission 015 is the telemetry truth layer. Events now carry a real wall-clock
`ts` (both `RunEventJournal.append` and `EventSequencer.create`). Persistence
keeps provider-reported `usage` and `finish_reason` (opaque, un-normalized,
never clobbered with null) plus `started_at`/`completed_at` on each message,
fixing the confirmed pre-existing bug where a Moderator's finish reason
silently disappeared on every reload. The frontend truth layer captures
`usage`/`startedAt`/`completedAt` per seat through the live stream, history
entries, hydration, and archiving, and adds the single `describeUsage`
provenance vocabulary — nothing renders yet. Mission 015 also fixes the last
Mission 014 leftover: the streaming route test now uses an isolated
persistence, proven by an empty `data/modelmix/sessions/` after the full suite.
It corresponds to Punch Board items **25** (partial slice), **10** (fix), and
**17** (partial).

## Mission 016 Result

**Mission 016 is implemented and verified locally.**

Mission 016 converts the cockpit's top area into one thin persistent strip and
adds CSS-driven panel view controls. `ModelMixObserver` now renders a single
`header.modelmix-topbar` (brand, inert `Mode: Mix` label, session status from
the existing `observer.overall` vocabulary, New Session moved out of
`.modelmix-actions` with its handler/disabled binding unchanged, a Details
disclosure that stays off by default and hides the `Run: <id>` /
`Last sequence: <n>` debug line, and the unchanged Back to Council link — with
no Settings entry). Each `TranscriptPane` header gains Collapse/expand (hides
only the transcript body; header stays) and Maximize (one panel full width,
others CSS-hidden, all three nodes still mounted), plus one Reset control that
appears whenever any panel is collapsed or maximized. Layout state lives only in
new local `panelView`/`detailsOpen` state in `ModelMixObserver`; the pure view
helpers live in `frontend/src/panelView.js` (`getPanelViewClasses`,
`panelLayoutNeedsReset`, `DEFAULT_PANEL_VIEW`, `PANEL_SEATS`);
`modelmixState.js` and `modelmixApi.js` are byte-identical to Mission 015, and
no backend file changed. Tests: 4 new pure unit tests + 6 new jsdom render tests
of the real component (mocked API layer, completed-session hydration,
deterministic per-test DOM cleanup). It corresponds to Punch Board item **24**
(further advanced: Mission 012's New Session control now sits in the compact
strip); an interactive Mode selector and the Settings surface remain open.

## Mission 017 Result

**Mission 017 is implemented and verified locally.**

Mission 017 is the Settings shell. `configuredModels.js` exports
`configuredSources` (implementation unchanged). `ModelMixObserver` gains a gear
entry in the top bar (`aria-label="Settings"`, `aria-expanded`) that opens a
conditionally-rendered modal overlay — so the default cockpit still contains no
"Settings" text, preserving the existing render test — with three sections:
**About** renders the real `pkg.version` from an imported `../../package.json`
(no duplicated literal), the MIT/copyright line, text-only AI Counsel
attribution, and the repo URL; **Providers** lists OpenRouter / Ollama /
Direct / Custom / OAuth as Connected or Not connected, computed at render from
the exported `configuredSources` against the settings snapshot `loadModels`
already fetches, with zero credential values and an honest "unavailable" state
when the snapshot is null; **Defaults** saves/clears the
`modelmix.defaultSeatModels` localStorage trio (`worker_a`/`moderator`/`worker_b`)
and the three seat selectors initialize from the saved value, falling back to
the frozen `FALLBACK_SEAT_MODELS` that exactly preserves the previous built-in
literals — so criterion "no saved defaults → the exact hardcoded selections"
is a direct regression test. New state is local-only (`settingsOpen`,
`settingsSection`, `settingsSnapshot`, `defaultsRevision`); `modelmixState.js`,
`modelmixApi.js`, and all backend files are unchanged; `Settings.jsx`/`App.jsx`
(separate Council root) are untouched; no new dependencies. Tests: 5 new
`configuredSources.test.js`, 5 new `defaultSeatModels.test.js`, 8 new jsdom
render tests `ModelMixSettings.test.jsx` (mocked API with a mutable
`vi.hoisted` settings container, discovery mocked while the real
`configuredSources` runs via `importOriginal`, per-test deterministic cleanup) —
plus the existing **51 frontend tests pass unmodified** (criterion), for **69
passed**; `npm run lint` clean; `npm run build` green; backend **360 passed**
unchanged. It corresponds to Punch Board items **26** (advanced: real
provider/settings surface), **4** (partial: visible license/copyright/credit),
and **24** (advanced: Settings surface delivered; interactive Mode selector
remains open).

## Mission 018 Result

**Mission 018 is implemented and verified locally.**

Mission 018 makes Mission 015's captured telemetry visibly honest in the
cockpit. A new pure module `frontend/src/seatTelemetry.js` builds a compact
footer item list per seat via `buildSeatTelemetry(seat, seatKey)`, reusing the
single `describeUsage` provenance vocabulary: usage renders as `authoritative
(provider-reported)` showing the provider-reported total token count
(`total_tokens`/`totalTokenCount`, formatted `<n> tokens`) when it is a finite
number, else the raw provider key names as fallback (never normalized, never
merged into a fake percentage) or honest `unavailable`; Moderator-only
`finish_reason` renders as-is or `not reported`; elapsed timing from
`started_at`/`completed_at` renders as `HH:MM:SS → HH:MM:SS` and is explicitly
labeled `(calculated)` because it is ModelMix-computed, and a running seat
shows `Started:` without fabricating a duration. `TranscriptPane` renders a
`.modelmix-telemetry` footer **only for the live turn** when the seat has run —
prior-turn archives keep their telemetry hidden (explicitly deferred
follow-up), and cost/pricing wiring is deliberately out of scope (never
guessed, never displayed). Rendering is gated on honest data presence; idle
and waiting seats show no footer. Tests: 13 new node tests
`seatTelemetry.test.js` (formatting, provenance labeling, timing, finish
reason, oversized usage, no-fabrication rules) and 3 new jsdom render tests
`ModelMixTelemetry.test.jsx` (no-session → zero footers; completed seats →
authoritative/finish/calculated footers; prior-turn archives → zero `prior`
footers while the live turn renders, with known-unknown `not reported`),
reusing the `vi.hoisted` mutable hydrate container pattern — plus the existing
**69 frontend tests pass unmodified**, for **85 passed**; `npm run lint`
clean; `npm run build` green (437 modules); backend **360 passed** unchanged.
Backend, `modelmixState.js`, and `modelmixApi.js` are untouched. It closes Punch
Board item **25** (SUBSTANTIALLY SATISFIED — MISSIONS 015/018, with the two
deferrals noted) and verifies items **10** (ordering/timing contract) and
**17** (timing guardrail input) as visible.

## Evidence Rule

Historical worker branch names, reports, local commit SHAs, or PASS statements are evidence to reconcile; they are not proof of current remote state by themselves.

The accepted repository state is what is reachable from current `main`. Historical mission reports are retained as execution evidence and provenance.

## Record Repair Note

On 2026-08-28 CT, project bookkeeping was reconciled after detecting that Mission 001 and Mission 007 reports were missing from `main` even though corresponding work/evidence existed elsewhere. Mission 001 was recovered from its verified Claude branch object; Mission 007 was reconstructed from the observed ChatGPT Work result and verified GitHub commit.

On 2026-08-29 CT, the current Library Punch Board and repo project records were reconciled. The authoritative Punch Board was copied into `docs/modelmix/PUNCH-BOARD.md`, while this index and `ENGINEERING-PROGRESS.md` were refreshed to point to the same current mission state and next gap.

Later on 2026-08-29 CT, Mission 007.5 was inserted as a security/compatibility interlock after dependency remediation reached a clean audit but exposed an MCP 2.x API incompatibility in inherited MCP code. Mission 007.5 subsequently completed and was verified on remote `main` at `e018ed06807beda2c11531f065b2d4181c346ca8`.
