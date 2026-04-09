# Spec Decision: XP Curve Targeting 2-3 Years To Level 100

Goal: pick ONE XP curve and tuning approach that makes Level 100 land in ~2-3 years for a typical committed player, without making early levels feel miserable.

This doc is written so Hasan (PM) can delegate the decision cleanly.

## Why this decision is needed
We currently have multiple XP systems described across docs (and some code already exists).
If we do not pick a single source of truth, the game will drift and balancing will never converge.

## Non-negotiables
- Backend is server authoritative.
- No double-awards.
- XP must be tunable without breaking old players.
- Time-to-100 should be stable across "normal" play patterns, not only for whales or only for grinders.

## Decision inputs

### Candidate A: "Unified Master System" formula
- Incremental requirement per level:
  - `XP_required(level) = 100 * (1.12 ^ (level - 1))`
- Total XP to reach a level N is the sum of requirements from 1..N.
- Has an explicit 2-3 year intent in your new unified spec.

Important consistency check:
- If we interpret that formula as incremental-per-level and sum it, XP to reach level 100 is ~69.6 million.
- The same unified spec text also states `XP_100 ~= 900,000`.
- Those cannot both be true at the same time, so we must choose which number is the anchor:
  - Option 1: keep the "XP_100 ~= 900k" intent and tune the curve to match it.
  - Option 2: keep the 1.12 growth rate and accept a much larger XP_100.
  - Option 3: change the growth rate (1.12) to a smaller value so the sum lands near 900k.

### Candidate B: "Canonical system spec" formula
- Total XP -> level mapping:
  - `level = floor((xp / 250) ^ 0.606)`
- Total XP to reach a level L can be approximated by inverting that function.

## How we will evaluate "best for 2-3 years"

We will simulate time-to-100 for a few profiles:
- Casual: 15-30 min/day, 3-4 days/week
- Regular: ~1 hr/day, 5 days/week
- Committed: 1-2 hr/day, 6-7 days/week

And we will test sensitivity to:
- drip availability (requires 1 ritual/day)
- honey usage
- party size/synergy assumptions
- XP cap behavior (active XP cap)

## Tooling

Use:
- `scripts/xp-time-to-100.js`

The script is not perfect. It is a decision aid so we stop guessing.

## Preliminary recommendation template (Hasan)

When we decide, we will fill this in:

- Chosen curve:
- Why:
- What we lock:
- What remains tunable:
- Expected time-to-100:
  - Casual:
  - Regular:
  - Committed:
- Risks:
- Mitigations:

## Next steps
1. Run the time-to-100 simulation for both curves with reasonable defaults.
2. Pick the curve.
3. Update the canonical spec docs so there is ONE truth.
4. Add automated tests for the chosen XP curve function so it cannot drift silently.

## Hasan decision (Definitive)

Chosen curve: **Geometric per-level requirements (incremental), tuned for 2-3 years to Level 100**

Definition:
- `xp_to_next_level(L) = round(100 * 1.072416^(L-1))` for `L = 1..100`
- `total_xp_to_reach_level(L) = sum_{i=1..L} xp_to_next_level(i)`
- This yields `total_xp_to_reach_level(100) ~= 1,500,000`

Why this is the best long-run choice:
- It is simple, explainable, and stable for years.
- It gives fast onboarding early, and meaningful grind later, without exploding into 10s of millions XP.
- It targets ~2.5 years for a “regular” player under reasonable daily XP assumptions, and can be tuned by adjusting XP earning rates without changing the curve.
- It avoids the spec contradiction where `1.12` growth implies ~69.6M total XP to reach 100, which is not compatible with a 2-3 year target unless XP awards become absurd.

What is locked:
- The curve shape and its Level-100 total target (~1.5M).

What remains tunable (without breaking the curve):
- XP earning rates (active tick XP, drip XP, multipliers, caps).
- Eligibility gates (drip requires >=1 ritual/day).
- Catch-up multiplier.

Acceptance criteria for “2-3 years”:
- After we log real XP/day for 30 days, the median “regular” cohort projects Level 100 at 24-36 months.

Tool:
- `node scripts/xp-time-to-100.js` (decision aid; calibrate with telemetry).
