# Hasan's Completion Map (From Today -> 100% MMO)

This is the big-picture map that makes the 100-task roadmap feel like a straight path instead of a maze.

If you only read one doc each day, read `docs/sprint.md`.

Related:
- `docs/mmo-roadmap-100-tasks.md` (the full 100 tasks)
- `docs/sprint.md` (Now / Next / Blocked)
- `docs/risks.md` (top risks)

## The 6 Milestones To "100% MMO"

### Milestone 0: Stack Is Green (Reliable Base)
Definition: we can boot, test, and iterate without random failures.

Done when:
- `/api/health` is 200
- `/api/worker/heartbeat` is 200
- relay `/health` is 200
- `artifact-smoke` passes
- schema drift does not break sessions
- production Nginx is hardened and verified (security headers, WS timeouts, static caching)

Roadmap tasks:
- Phase 1 items (especially 1-10)
- `docs/testing-today-2026-04-09.md`

Evidence:
- recent health-check log lines
- recent passing artifact smoke run

---

### Milestone 1: Core Loop Works (Sessions -> Ritual -> Reward)
Definition: the MMO loop works for real humans, not just happy-path scripts.

Done when:
- session start/tick/end always works (including timeouts and retries)
- drip respects rules (ritual prerequisite + anti-AFK)
- XP and level move correctly and never double-award
- `/api/world` reflects current activity so the HUD feels alive

Roadmap tasks:
- Phase 3 (21-30)
- Phase 4 (31-40)
- Phase 6 basics for `/api/world` (51-53)

Evidence:
- one end-to-end manual test script/checklist that we can rerun
- a short recorded “golden path” run (HUD/web sees events)

---

### Milestone 2: Economy Is Safe (Honey, Pentacles, Challenges)
Definition: rewards are consistent, exploit-resistant, and tunable.

Done when:
- honey rules match spec (durations, cooldowns, uses/day)
- pentacles only come from correct outcomes
- purchases increment treasury and can be audited
- challenges can’t be double-claimed and progress persists

Roadmap tasks:
- Phase 5 (41-50)

Evidence:
- tests for honey, pentacles, purchase, and challenge claim
- simple admin report showing treasury totals and reward flow

---

### Milestone 3: World Feels Like An MMO (Zones, Battles, Artifacts)
Definition: territory pressure, battles, and artifacts shape behavior.

Done when:
- battle bar is never null and always returns consistent fields
- zone pressure tick/decay/flip works under load
- artifacts spawn/register/expire reliably and affect gameplay in controlled ways

Roadmap tasks:
- Phase 6 (51-60)

Evidence:
- `/api/world` shows battle + events + metrics
- zone flip and battle events show up in the feed
- artifact expiry is proven (no “ghost buffs”)

---

### Milestone 4: Second Life Integration Is Real (Not A Prototype)
Definition: SL objects are I/O only and the backend is authority.

Done when:
- HUD and furniture work with real players
- tokens are handled safely (no spoofed rewards)
- zones and artifacts from SL behave correctly
- there is a clear setup guide and a troubleshooting guide

Roadmap tasks:
- Phase 7 (61-70)
- Phase 8 (71-80)

Evidence:
- one full SL -> API -> worker -> relay -> HUD/web run captured
- “SL setup guide” that a non-coder can follow

---

### Milestone 5: Launch-Grade Operations (Deploy, Monitor, Recover)
Definition: we can ship updates and recover from incidents calmly.

Done when:
- secrets are stored correctly
- backups and restore drills are real
- migrations are consistent (no drift surprises)
- monitoring + alerts exist and runbooks are usable
- load tests are runnable on demand

Roadmap tasks:
- Phase 9 (81-90)
- Phase 10 (91-100)

Evidence:
- “release checklist” used for at least 2 releases
- k6 load results recorded for current build
- a restore drill succeeded in staging

## Hasan’s “No Overwhelm” Rule

We never try to finish 100 tasks in one sprint.

Daily:
- 1-3 Now tasks only.
- Verify.
- Archive.

Weekly:
- Ship one milestone improvement that we can prove.

## Current Focus (Right Now)

From `docs/sprint.md`, the practical order is:
- Spec decision locked (XP curve)
- k6 tooling (unblocks real load testing)
- basic API tests (so we stop regressing)

When those are done, we push hard on Milestone 1 (core loop), because that is where the “#1 game” feeling will come from.
