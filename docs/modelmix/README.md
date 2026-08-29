# ModelMix Project Records

This directory is the repository home for ModelMix implementation state, mission evidence, locked build decisions, and roadmap tracking.

## Start Here

| Document | Purpose |
|---|---|
| [`PUNCH-BOARD.md`](PUNCH-BOARD.md) | **Authoritative build order, locked architecture decisions, alpha scope, and roadmap** |
| [`ENGINEERING-PROGRESS.md`](ENGINEERING-PROGRESS.md) | **Current implementation overlay** showing what is satisfied, partial, open, and the immediate engineering gap |
| [`MISSION-INDEX.md`](MISSION-INDEX.md) | **Mission ledger and provenance** for completed and upcoming implementation missions |

## Mission Reports

Historical engineering evidence accepted through Mission 007 plus the current 007.5 interlock record:

1. [`001-baseline-architecture-spike.md`](001-baseline-architecture-spike.md)
2. [`002-first-streaming-slice.md`](002-first-streaming-slice.md)
3. [`003-event-journal-reconnect.md`](003-event-journal-reconnect.md)
4. [`004-first-frontend-observer.md`](004-first-frontend-observer.md)
5. [`005-moderator-backend-phase.md`](005-moderator-backend-phase.md)
6. [`006-three-panel-cockpit-slice.md`](006-three-panel-cockpit-slice.md)
7. [`007-searchable-model-discovery-controls.md`](007-searchable-model-discovery-controls.md)
8. [`007.5-mcp-2-security-compatibility.md`](007.5-mcp-2-security-compatibility.md) — **OPEN / READY TO DISPATCH**

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

As of 2026-08-29 14:23 CT:

- Missions **001–007** are recorded as PASS.
- Mission **007.5** is **OPEN / READY TO DISPATCH** as a security/compatibility interlock.
- Mission **008** remains the next planned product mission but is blocked until 007.5 closes.
- The 007.5 trigger is a verified MCP 2.x API incompatibility exposed after dependency remediation reached clean frontend and Python audits.
- The local remediation state is not represented as already accepted on remote `main`; remote state and the local working tree must be reconciled before implementation/commit.
- The next product gap after 007.5 remains durable ModelMix session/run persistence and cockpit hydration.
- Alpha persistence remains **versioned atomic JSON behind a ModelMix-owned interface**.
- **SQLite migration is not part of the alpha plan.**
- Browser/React single-window cockpit remains the alpha surface.
- Tauri 2 packaging, detachable windows, Android, Deep Mix, and other advanced capabilities remain after the alpha gate unless a verified technical dependency changes the order.

## Mission 007.5 Boundary

Mission 007.5 exists only to keep the repository security-clean and compatible with MCP 2.x.

It does **not** promote MCP into ModelMix alpha scope. The work should update only the inherited MCP integration and directly affected tests/dependency state, preserve the existing ModelMix architecture, and close with observed audit/test/remote verification evidence.

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
