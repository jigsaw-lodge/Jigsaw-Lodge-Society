# Agent Team (Beginner-Friendly)

This folder defines a small "agent team" that works alongside the main coding agent.

The goal is to make progress feel simple:
- always know the next few tasks
- keep definitions of "Done" clear
- catch risks early
- write down decisions so we do not forget why something was built a certain way

## How We Use Agents In Practice

Each agent produces small artifacts in `docs/`:
- `docs/sprint.md` (Now / Next / Blocked / Done)
- `docs/risks.md` (top risks + mitigations)
- `docs/qa-checklist.md` (what to test before "Done")
- `docs/release-notes.md` (what changed, how verified)

We keep agent outputs short and opinionated. No walls of text.

Default model split:
- Hasan coordinator on the stronger model.
- Worker pods on the mini model with `scripts/hasan-worker-pack.sh`.
- Anything risky or ambiguous escalates back to Hasan before it is treated as done.

## Recommended Roles

0. Hasan (PM Lead)
- Oversees the legacy 33-role hive and delegates across pods.
- Speaks to the user as a beginner-friendly project manager.
- See: `agents/HASAN.md` and `agents/prompts/hasan.md`

1. PM Agent
- Owns sequencing, dependencies, acceptance criteria.
- Keeps `docs/sprint.md` and `docs/risks.md` current.

2. QA Agent
- Owns "how do we know this works?"
- Maintains `docs/qa-checklist.md` and updates "known gaps".

3. Gameplay Systems Agent
- Owns the spec-to-code translation for rituals, XP, honey, challenges, battles.
- Maintains `docs/gameplay-decisions.md` (short notes, not a novel).

4. Ops/Security Agent
- Owns deploy readiness: tokens, backups, migrations, monitoring, incident runbooks.
- Maintains `docs/ops-ready.md`.

5. Docs/Onboarding Agent
- Owns beginner documentation: local setup, environment variables, common errors.
- Maintains `docs/local-setup.md` and `docs/api-cheatsheet.md`.

## Prompt Templates

Use the templates in `agents/prompts/` as starting points.
They are intentionally strict: short output, clear "next actions", clear "done when".
