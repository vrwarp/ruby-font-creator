# BRIEFING — 2026-06-04T22:34:00-07:00

## Mission

Modernize the ruby-font-creator repository: migrate to TypeScript/ESM, configure npm, replace AVA with Vitest, replace webfont with svgtofont, inline chinese-data, remove submodules, set up ESLint v9/Prettier/Husky/lint-staged, and set up CI.

## 🔒 My Identity

- Archetype: Project Orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/btsai/antigravity/ruby-font-creator/.agents/orchestrator_modernization
- Original parent: main agent
- Original parent conversation ID: 1ab0a2d1-7482-483d-8af0-dbedf0cb51eb

## 🔒 My Workflow

- **Pattern**: Project
- **Scope document**: /Users/btsai/antigravity/ruby-font-creator/PROJECT.md

1. **Decompose**: Decompose repository modernization into logical, sequential milestones.
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Explorer → Worker → Reviewer → test → gate
   - **Delegate (sub-orchestrator)**: For complex milestones, spawn sub-orchestrator
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Self-succeed at 16 spawns, write handoff.md, spawn successor.

- **Work items**:
  1. Explore current codebase and submodules [pending]
  2. Implement package modernization, TypeScript, ESM, and Vitest [pending]
  3. Inline chinese-data submodule and clean up gitmodules [pending]
  4. Migrate svg/font building to svgtofont [pending]
  5. Setup linting/formatting and CI [pending]
  6. Final validation [pending]
- **Current phase**: 1
- **Current focus**: Explore codebase and submodules

## 🔒 Key Constraints

- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- Forensic Auditor verdict is CLEAN and is a binary veto.
- Do not reuse a subagent after it has delivered its handoff — always spawn fresh.

## Current Parent

- Conversation ID: 1ab0a2d1-7482-483d-8af0-dbedf0cb51eb
- Updated: not yet

## Key Decisions Made

- [TBD]

## Team Roster

| Agent             | Type                      | Work Item                                   | Status      | Conv ID                              |
| ----------------- | ------------------------- | ------------------------------------------- | ----------- | ------------------------------------ |
| explorer_analysis | teamwork_preview_explorer | Codebase exploration and migration analysis | in-progress | b4a51e0d-be53-444a-a527-16187fbd6b64 |

## Succession Status

- Succession required: no
- Spawn count: 0 / 16
- Pending subagents: none
- Predecessor: none
- Successor: not yet spawned

## Active Timers

- Heartbeat cron: 95726df3-f881-4677-aa8a-cc420c71ef5c/task-25
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index

- /Users/btsai/antigravity/ruby-font-creator/PROJECT.md — Project milestones, architecture, and code layout definition
- /Users/btsai/antigravity/ruby-font-creator/.agents/orchestrator_modernization/progress.md — Heartbeat and status checklist
