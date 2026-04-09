# Risks Register (Top Risks Only)

Keep this short. If it gets long, we are not prioritizing.

## R1 - Load Testing Tooling Missing
- Risk: We cannot prove 95th latency and throughput targets on demand.
- Impact: "MMO ready" claims become guesswork.
- Mitigation: Install/containerize `k6` and record load test results per release.
- Owner: Platform/Perf

## R2 - Schema Drift Between `init.sql`, runtime schema, and live DB
- Risk: Fresh env boots or long-running DBs fail in subtle ways (missing columns/tables).
- Impact: Worker errors, broken sessions, broken artifacts.
- Mitigation: Standardize migrations and add drift checks in CI.
- Owner: Platform/Data

## R3 - Docs Claiming "Done" Without Current Evidence
- Risk: We think we're green when we're not.
- Impact: launch surprises and lost time during incidents.
- Mitigation: Redefine "Done" as "verified in the last N days" and attach evidence links.
- Owner: PM/QA

## R4 - Token Handling And Security In Second Life
- Risk: In-world scripts leak tokens or allow spoofed rewards.
- Impact: cheating, economy damage, trust loss.
- Mitigation: server authority, shared token enforcement, minimal SL client authority, audit logs.
- Owner: Ops/Security + SL
