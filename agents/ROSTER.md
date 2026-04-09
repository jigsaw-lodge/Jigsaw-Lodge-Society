# JLS Virtual Coding Firm (30-50 Worker Feel)

We do not need 50 separate chat threads to get "50 worker" throughput.
Instead, we use a virtual roster: each "worker" has a narrow charter, clear outputs, and we run them in short rounds.

This keeps the project coordinated and beginner-friendly.

## Legacy 33-Role System (Integrated)

You shared a legacy "Engineering Hive (33 agent roles)" document (2026-03-17).
We keep that mental model, but we implement it using the pods below.

Legacy reference:
- `agents/legacy-33/HIVEMIND-EXECUTION-ANALYSIS-2026-03-17.md`

Mapping notes:
- Some legacy roles map 1:1 (Backend Engineer, Database Engineer, WebSocket Engineer).
- Some legacy roles map to our pods (Ritual Engine, Territory Simulation, Ops/Security).
- We also added a few roles that modernize execution (QA gating, docs onboarding, release management).

## How This Works

- We run in rounds (usually 15-45 minutes):
  - PM selects 3-5 "Now" tasks.
  - We assign them to pods.
  - Each pod produces 1-2 concrete outputs (PR-ready code, tests, docs, or scripts).
  - QA verifies, then PM marks the roadmap.

- We only "activate" a handful of workers at a time, but we keep 30-50 specialized roles defined so nothing falls through the cracks.

## Pods

Platform Pod
- A01 Backend API Engineer
- A02 Worker/Engine Engineer
- A03 Redis Reliability Engineer
- A04 Postgres/Schema Engineer
- A05 WebSocket/Relay Engineer
- A06 Performance/Load Engineer (k6, latency, TPS)
- A07 Tooling Engineer (scripts, one-command checks)

Gameplay Pod
- A11 XP/Leveling Engineer
- A12 Ritual/Session State Machine Engineer
- A13 Honey/Cooldowns Engineer
- A14 Drip/Anti-AFK Engineer
- A15 Challenges Engineer
- A16 Pentacles/Treasury Engineer
- A17 Zones/Pressure/Flip Engineer
- A18 Battle System Engineer
- A19 Artifact System Engineer
- A20 Economy Balance Analyst (docs + guardrails)

Client Pod (Web + HUD)
- A21 Web UI Engineer (frontend)
- A22 World Snapshot UX Engineer (/api/world consumers)
- A23 Feed/Ticker Engineer
- A24 Cosmetics/Kiosk Engineer
- A25 Leaderboard Engineer
- A26 HUD Contract Engineer (JSON contracts + docs)
- A27 Websocket Client Resilience Engineer (reconnect UI)

Second Life Pod (LSL + In-world)
- A31 LSL HUD Engineer
- A32 Furniture/Session Object Engineer
- A33 Zone Module Engineer
- A34 Artifact Object Engineer
- A35 Token/Auth In-World Engineer (safe patterns)
- A36 SL Integration QA (end-to-end scripts/checklists)

QA Pod
- A41 Smoke Test Engineer (artifact-smoke, replay)
- A42 API Contract Tester
- A43 Worker Logic Test Engineer
- A44 Load/Soak Test Runner
- A45 Regression Gatekeeper (what must never break)

Ops/Security Pod
- A51 Secrets/Vault Engineer
- A52 Backup/Restore Engineer
- A53 Migration/Drift Engineer
- A54 Monitoring/Alerting Engineer
- A55 Incident Commander (runbooks)
- A56 Release Manager (rollouts, rollback)
- A57 Security Reviewer (CORS/tokens/audit)

Docs/Onboarding Pod
- A61 New Coder Onboarding Writer
- A62 API Cheatsheet Writer
- A63 Ops Runbook Writer
- A64 Gameplay Spec Sync Writer

Program/PM Pod
- A70 Hasan (PM Lead, delegates across the hive)
- A71 Project Manager (roadmap + sprint)
- A72 Technical Producer (dependencies + sequencing)
- A73 Risk Manager (top risks, mitigations)
- A74 Change Log / Release Notes Writer

## Legacy Role Crosswalk (Quick)

This crosswalk helps you translate older notes into today's roster.

- ARCHITECT PRIME -> A71/A72 (PM) + A01 (API) + A02 (Worker)
- BACKEND ENGINEER -> A01
- REDIS WORKER ENGINEER -> A02 + A03
- DATABASE ENGINEER -> A04
- API CONTRACT ENGINEER -> A42 + A62
- WEBSOCKET ENGINEER -> A05 + A27
- SECURITY ENGINEER -> A57 + A35
- PERFORMANCE ENGINEER -> A06
- SCALABILITY ENGINEER -> A06 + A09
- EVENT PIPELINE ENGINEER -> A10 + A01
- XP ENGINE ENGINEER -> A11
- RITUAL ENGINE ENGINEER -> A12
- CHAIN SYSTEM ENGINEER -> A13 (bonds/chains)
- ARTIFACT ECOLOGY ENGINEER -> A19 + A20
- TERRITORY SIMULATION ENGINEER -> A17
- FACTION POLITICS ENGINEER -> A18 (orders) + A20 (balance)
- CONVERGENCE ENGINE ENGINEER -> A12/A18 (future)
- WORLD INTELLIGENCE ENGINEER -> A18 (future)
- RITUAL FORECAST ENGINEER -> A18/A19 (future)
- LORE ENGINE ENGINEER -> (future; would live under Gameplay/Client)
- HUD ENGINEER -> A26 + A21
- HUD ANIMATION ENGINEER -> A23
- HUD STATE MACHINE ENGINEER -> A26
- AVSITTER2 INTEGRATION ENGINEER -> A32
- PLAYER EXPERIENCE ENGINEER -> A25
- DEVOPS ENGINEER -> A56
- MONITORING ENGINEER -> A54
- LOGGING ENGINEER -> A86 (covered by Ops/QA) + A28
- STABILITY ENGINEER -> A29 + A45
- SYSTEMS ANALYST -> A73
- MONETIZATION ARCHITECT -> A16 + A24
- COMMUNITY SYSTEMS DESIGNER -> A32 (future) + Client pod
- PROJECT SYNTHESIS LEAD -> A71/A74

## Outputs (What Each Worker Produces)

- Code changes: small, reviewable patches with verification steps.
- Tests: a runnable command and expected outputs.
- Docs: one page max, beginner-first, includes "Done when".
- Scripts: one command that does the boring thing safely and repeatably.

## Rules To Prevent Overwhelm

- Never have more than 5 "Now" tasks.
- If a task takes >1 day, split it.
- If a doc claims "Done" but the system is not currently green, we downgrade it.
- We prefer real evidence: logs, passing smoke, passing health, passing test output.
