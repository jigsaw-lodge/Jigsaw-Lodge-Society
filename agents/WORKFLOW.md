# JLS Agent Firm Workflow (Simple + Repeatable)

This is the operating system for the "virtual coding firm".

## Daily Loop (Beginner Friendly)

1. PM updates `docs/sprint.md`:
   - Now (max 3)
   - Next (max 5)
   - Blocked
   - Done today

Optional: run the daily gating loop in one command:
- `env ADMIN_TOKEN=... bash scripts/hasan-daily-run.sh`

2. Assign each "Now" item to a pod:
   - Platform, Gameplay, Client, SL, QA, Ops, Docs

3. Implement changes in small patches:
   - Prefer 1-3 files touched per task.
   - Add a short verification command.

4. QA verifies:
   - health checks
   - artifact smoke
   - one manual flow
   - relevant automated tests (if present)

5. Close the loop:
   - Update `docs/mmo-roadmap-100-tasks.md` statuses
   - Add a short note to `docs/release-notes.md` (optional)
   - Create a daily archive bundle (legacy council policy):
     - `bash scripts/daily-archive.sh`

## What To Do When Stuck

- Reduce scope: define the smallest measurable improvement.
- Capture evidence:
  - exact error message
  - which command
  - which container/service
- Ask for help on ONE task at a time.

## Minimum Gating For "Green"

- `/api/health` returns `200`
- `/api/worker/heartbeat` returns `200`
- relay `/health` returns `200`
- `artifact-smoke` passes
