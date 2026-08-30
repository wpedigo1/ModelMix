# ModelMix Project Records

This directory is the repository home for ModelMix implementation state, mission evidence, locked build decisions, and roadmap tracking.

## Start Here

| Document | Purpose |
|---|---|
| [`PUNCH-BOARD.md`](PUNCH-BOARD.md) | **Authoritative build order, locked architecture decisions, alpha scope, and roadmap** |
| [`ENGINEERING-PROGRESS.md`](ENGINEERING-PROGRESS.md) | **Current implementation overlay** showing what is satisfied, partial, open, and the immediate engineering gap |
| [`MISSION-INDEX.md`](MISSION-INDEX.md) | **Mission ledger and provenance** for completed and upcoming implementation missions |

## Mission Reports

Historical engineering evidence through locally verified Mission 018:

1. [`001-baseline-architecture-spike.md`](001-baseline-architecture-spike.md)
2. [`002-first-streaming-slice.md`](002-first-streaming-slice.md)
3. [`003-event-journal-reconnect.md`](003-event-journal-reconnect.md)
4. [`004-first-frontend-observer.md`](004-first-frontend-observer.md)
5. [`005-moderator-backend-phase.md`](005-moderator-backend-phase.md)
6. [`006-three-panel-cockpit-slice.md`](006-three-panel-cockpit-slice.md)
7. [`007-searchable-model-discovery-controls.md`](007-searchable-model-discovery-controls.md)
8. [`007.5-mcp-2-security-compatibility.md`](007.5-mcp-2-security-compatibility.md) — **PASS**
9. [`008-durable-persistence-cockpit-hydration.md`](008-durable-persistence-cockpit-hydration.md) — **PASS**
10. [`009-seat-scoped-multi-turn-context.md`](009-seat-scoped-multi-turn-context.md) — **PASS (LOCAL)**
11. [`010-seat-history-budget.md`](010-seat-history-budget.md) — **PASS (LOCAL)**
12. [`010.5-frontend-test-runner-interlock.md`](010.5-frontend-test-runner-interlock.md) — **PASS (LOCAL)**
13. [`011-multi-turn-cockpit-display.md`](011-multi-turn-cockpit-display.md) — **PASS (LOCAL)**
14. [`012-session-control-and-prompt-plumbing.md`](012-session-control-and-prompt-plumbing.md) — **PASS (LOCAL)**
15. [`013-run-and-seat-timeouts.md`](013-run-and-seat-timeouts.md) — **PASS (LOCAL)**
16. [`014-reachability-and-test-hygiene.md`](014-reachability-and-test-hygiene.md) — **PASS (LOCAL)**
17. [`015-telemetry-truth-layer.md`](015-telemetry-truth-layer.md) — **PASS (LOCAL)**
18. [`016-compact-top-bar-and-panel-controls.md`](016-compact-top-bar-and-panel-controls.md) — **PASS (LOCAL)**
19. [`017-settings-shell.md`](017-settings-shell.md) — **PASS (LOCAL)**
20. [`018-telemetry-rendering.md`](018-telemetry-rendering.md) — **PASS (LOCAL)**

Mission reports preserve what was observed or delivered during that slice. They do not automatically override a later locked decision in the Punch Board.

## Source-of-Truth Order

When project records appear to conflict, use this order:

1. **Observed current repository state** — actual files/history reachable from the branch being inspected.
2. **`PUNCH-BOARD.md`** — locked project decisions, sequencing, alpha gate, and roadmap.
3. **`ENGINEERING-PROGRESS.md`** — reconciliation of the locked board against accepted implementation.
4. **Individual mission reports** — historical execution evidence and active mission records.
5. **Library research / older vision documents** — valuable context, but superseded where later locked decisions conflict.

Do not silently promote an older proposal into a current architecture decision.

## Current Project Checkpoint

As of 2026-08-30 CT:

- Missions **001–018** are recorded as implemented (007.5 interlock included); Mission 008 is present on current `main`.
- Mission **007.5** closed the MCP 2.x security/compatibility interlock.
- Accepted Mission 007.5 implementation commit: `e018ed06807beda2c11531f065b2d4181c346ca8`.
- MCP remains at **2.1.1**; Python and frontend dependency audits were recorded clean.
- Mission **008** adds durable ModelMix session/run persistence and cockpit hydration.
- Mission **009** adds bounded seat-scoped Worker/Moderator history with hot-swap continuity and explicit cross-seat leakage tests.
- Mission **010** gives seat history owned character budgets: 4,000 per message and 24,000 per seat with whole-turn oldest-first eviction.
- Mission **010.5** wires a Vitest runner (`npm test`) so the existing frontend suite executes with an observed 24/24 pass.
- Mission **017** adds the Settings shell: a gear entry in the top bar opens an in-app overlay — About surfaces the real version, MIT license, and text-only AI Counsel attribution; Providers is a read-only Connected/Not-connected list computed from the now-exported `configuredSources`; Defaults saves/clears the `modelmix.defaultSeatModels` localStorage trio and applies saved seat defaults at initial mount with the exact built-in fallbacks preserved.
- Mission **018** renders the telemetry truth layer honestly in the cockpit: compact per-seat footers (live turn only) show `Usage: authoritative (provider-reported)`/`unavailable`, the Moderator-only `finish_reason`, and ModelMix-calculated elapsed timing labeled `(calculated)`; per-historical-turn footers and cost/pricing wiring remain explicitly deferred follow-ups.
- Schema-v1 session files live under `data/modelmix/sessions/` by default and are written atomically behind the ModelMix persistence interface.
- Alpha persistence remains **versioned atomic JSON behind a ModelMix-owned interface**.
- **SQLite migration is not part of the alpha plan.**
- Browser/React single-window cockpit remains the alpha surface.
- Tauri 2 packaging, detachable windows, Android, Deep Mix, and other advanced capabilities remain after the alpha gate unless a verified technical dependency changes the order.

## Mission 007.5 Boundary

Mission 007.5 existed only to keep the repository security-clean and compatible with MCP 2.x.

It did **not** promote MCP into ModelMix alpha scope. The accepted work changed only the inherited MCP integration and directly affected tests/dependency state while preserving ModelMix architecture.

## Stable Product Doctrine

The project records in this directory preserve these core constraints:

- Worker A and Worker B are independent witnesses.
- Only the Moderator receives both worker outputs.
- No Stage 2 peer ranking/debate in the ModelMix path.
- Default UI is Worker A | wider Moderator | Worker B.
- Send and Stop are separate fixed adjacent controls.
- SSE remains the alpha transport with ordered run events and replay semantics.
- Seat history belongs to the seat, not to whichever model currently occupies it.
- No silent model/provider substitution.
- Telemetry must distinguish provider-reported, ModelMix-tracked/estimated, and unknown data.
- Credentials must not leak into prompts, frontend state, logs, session JSON, or repository files.

## Library Relationship

The ModelMix project Library preserves broader project history, research, external reviews, mission prompts/responses, and earlier vision material.

The repository keeps the engineering control documents needed to understand the current build without copying every research artifact into source control.

Where an older Library vision conflicts with the later locked Punch Board, the locked Punch Board controls unless a new verified fact causes an explicit decision change.
