# BRIEFING — 2026-06-05T17:38:24-07:00

## Mission

Orchestrate the conversion of Ruby Font Creator to a self-contained, offline-capable PWA with client-side font compilation and vendored dependencies.

## 🔒 My Identity

- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/btsai/antigravity/ruby-font-creator/.agents/orchestrator_pwa
- Original parent: main agent
- Original parent conversation ID: 7075bd43-a62f-47cc-b3aa-9ba9e72c618d

## 🔒 My Workflow

- **Pattern**: Project
- **Scope document**: /Users/btsai/antigravity/ruby-font-creator/PROJECT.md

1. **Decompose**: Decompose task into milestones and document in PROJECT.md
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Explorer → Worker → Reviewer → test → gate
   - **Delegate (sub-orchestrator)**: For large/independent milestones
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: succession at 16 spawns, write handoff.md, spawn successor

- **Work items**:
  1. Initialize project files and planning [pending]
- **Current phase**: 1
- **Current focus**: Initialize project files and planning

## 🔒 Key Constraints

- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- You MAY use file-editing tools ONLY for metadata/state files (.md) in your .agents/ folder.
- All implementation must be genuine, no hardcoding of test results or dummy/facade implementations.
- Zero tolerance for audit failures.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh

## Current Parent

- Conversation ID: 7075bd43-a62f-47cc-b3aa-9ba9e72c618d
- Updated: not yet

## Key Decisions Made

- Use Project Orchestrator pattern for implementing PWA with vendored dependencies.

## Team Roster

| Agent              | Type                          | Work Item                                | Status      | Conv ID                              |
| ------------------ | ----------------------------- | ---------------------------------------- | ----------- | ------------------------------------ |
| initial_explorer   | teamwork_preview_explorer     | Initial codebase exploration             | completed   | 852de92f-911e-4cb8-9cac-c4cd77b7d35d |
| sub_orch_e2e       | teamwork_preview_orchestrator | E2E Testing Track Orchestration          | completed   | d185932a-0382-4a28-ad1a-bb7fd6738b2b |
| sub_orch_impl      | teamwork_preview_orchestrator | Implementation Track Orchestration       | failed      | 56db4c40-4cfa-42b6-a285-ac7764100e71 |
| sub_orch_impl_gen2 | teamwork_preview_orchestrator | Implementation Track Orchestration Gen 2 | failed      | 7efe2ad3-818f-48d0-a42e-8c9890a32318 |
| sub_orch_impl_gen3 | teamwork_preview_orchestrator | Implementation Track Orchestration Gen 3 | in-progress | 53b147e7-ada1-465f-89da-df5eb3ccca10 |

## Succession Status

- Succession required: no
- Spawn count: 5 / 16
- Pending subagents: [53b147e7-ada1-465f-89da-df5eb3ccca10]
- Predecessor: none
- Successor: not yet spawned

## Active Timers

- Heartbeat cron: 66924b62-9af7-4732-9b73-4d7d88dcd914/task-63
- Safety timer: 66924b62-9af7-4732-9b73-4d7d88dcd914/task-173
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index

- /Users/btsai/antigravity/ruby-font-creator/PROJECT.md - Project decomposition and milestones
- /Users/btsai/antigravity/ruby-font-creator/.agents/orchestrator_pwa/progress.md - Agent progress and liveness heartbeat
- /Users/btsai/antigravity/ruby-font-creator/.agents/orchestrator_pwa/original_prompt.md - Record of original prompt
