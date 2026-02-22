# Extraction — Mission Control style (essentials)

Sources:
- X Article (Bhanu Teja P): https://x.com/pbteja1998/article/2017662163540971756
- YouTube pages (metadata only; transcript not accessible unauthenticated):
  - https://youtu.be/_CcxNydNfUU
  - https://youtu.be/L-SQ0HyRVo8

## What is “Mission Control” (core idea)
A shared, real-time **office/whiteboard** where multiple specialized agents operate like a team.
- Agents are independent “workers” (separate sessions) but coordinate via a **single shared system of record**.
- The UI is the *control plane*: kanban + activity feed + agent status cards + task details.

## Architecture (conceptual)
### 1) Agents = independent sessions
- Each agent has its own identity + memory files (SOUL/AGENTS/WORKING, daily notes).
- Separation prevents context bloat and allows specialization.

### 2) Mission Control = shared state
- One central database is the authoritative state: missions, tasks, comments, artifacts, approvals, costs.
- Real-time updates are key: when an agent posts, humans/other agents see instantly.

### 3) Cost control via cadence (heartbeats)
- Agents wake on a schedule (e.g., every ~15 min) and do:
  1) load working memory
  2) check mentions/assignments
  3) scan activity feed
  4) act or stand down (HEARTBEAT_OK)
- Stagger schedules so they don’t all wake simultaneously.
- Use cheaper models for routine wake-ups; expensive models only for “deep work”.

## Roles / team model (pattern)
- One coordinator (“Jarvis” / here: ALFRED) delegates, monitors, requests approvals, consolidates.
- Specialists have distinct voices and constraints; “good at everything” is discouraged.

## Minimal data model (from article; adapted)
The original example uses ~6 tables (agents/tasks/messages/activities/documents/notifications).
For our build, map to your required entities:
- Project
- Agent
- Mission
- Task
- Run
- Artifact (documents/attachments)
- EventLog (activities)
- Approval
- CostLog

## Execution flow (how work moves)
- Human or Alfred creates Mission/Task → assigns agents.
- Agents contribute asynchronously by posting comments, artifacts, status updates.
- Task transitions: Inbox/Assigned/In Progress/Review/Done (+ Blocked).
- Human reviews in “Review” and approves critical steps.

## UI essentials (what must be visible)
- Kanban board (pipeline).
- Real-time Activity Feed (audit trail, “what just happened”).
- Agent cards (idle/active/blocked + what they’re doing).
- Task/Mission detail view with:
  - objective
  - checklist
  - artifacts
  - links
  - status
  - risk
  - estimated cost
  - approvals

## Control & safety patterns
- “Approval gates” for high-risk steps.
- Immutable audit (EventLog) for accountability.
- Single place for discussion (threads per mission/task).

## Practical lessons (from article)
- Don’t jump to 10 agents at once; start with 2–3 solid.
- Put decisions into files/records; no “mental notes”.
- Build UI once text becomes unwieldy.
