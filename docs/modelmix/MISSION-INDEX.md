# ModelMix Mission Record Index

Updated: 2026-08-29 15:00 CT

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

## Evidence Rule

Historical worker branch names, reports, local commit SHAs, or PASS statements are evidence to reconcile; they are not proof of current remote state by themselves.

The accepted repository state is what is reachable from current `main`. Historical mission reports are retained as execution evidence and provenance.

## Record Repair Note

On 2026-08-28 CT, project bookkeeping was reconciled after detecting that Mission 001 and Mission 007 reports were missing from `main` even though corresponding work/evidence existed elsewhere. Mission 001 was recovered from its verified Claude branch object; Mission 007 was reconstructed from the observed ChatGPT Work result and verified GitHub commit.

On 2026-08-29 CT, the current Library Punch Board and repo project records were reconciled. The authoritative Punch Board was copied into `docs/modelmix/PUNCH-BOARD.md`, while this index and `ENGINEERING-PROGRESS.md` were refreshed to point to the same current mission state and next gap.

Later on 2026-08-29 CT, Mission 007.5 was inserted as a security/compatibility interlock after dependency remediation reached a clean audit but exposed an MCP 2.x API incompatibility in inherited MCP code. Mission 007.5 subsequently completed and was verified on remote `main` at `e018ed06807beda2c11531f065b2d4181c346ca8`.
