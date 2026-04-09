# Jigsaw Lodge Society — Canonical System Spec

*This document captures the locked-down master spec referenced by the system, covering the player schema, backend contracts, persistence strategy, rituals, XP curve, networking policies, artifact rules, and next-phase directives.*

## 1. Canonical Player Schema (Server Authority)
| Field | Type | Notes |
| --- | --- | --- |
| `avatar_id` | `string` | UUID primary key |
| `xp` | `number` | Full XP total |
| `level` | `integer` | Derived from XP |
| `rituals` | `integer` | Total rituals completed |
| `pentacles` | `number` | Current pentacle balance |
| `bonds` | `integer` | Total bond count |
| `bonded_partners` | `string[]` | Partner IDs |
| `watchers` | `integer` | Clamped 0–5 |
| `order` | `string` | Internal keys: `architect`, `eye`, `black_sun`, `neutral` |
| `honey_type` | `string` | `""`, `dev`, `royal`, `poison` |
| `honey_expire` | `unix` | Expiry timestamp |
| `honey_cooldown` | `unix` | Next available use |
| `surge_stacks` | `integer` | Charge counter |
| `surge_ready` | `boolean` | Ready flag |
| `ritual_progress` | `integer` | XP mod 100 |
| `session_xp` | `number` | Current session XP |
| `last_action_time` | `unix` | Last action timestamp |
| `last_seen` | `unix` | Most recent heartbeat |
| `last_zone` | `integer` | Zone identifier |

> **Authority rule:** the backend owns every field. LSL scripts are pure I/O.

> **Order naming rule:** keep the wire/storage keys short and stable. Public-facing names can be richer:
> - `architect` → `Architect Order`
> - `eye` → `Order of the Illuminated Eye`
> - `black_sun` → `Black Sun`
> - `neutral` → `Neutral Tide`

## 2. Backend Contracts (Locked API)
**Base expectations per request:** `avatar_id`, an action-specific payload, optional `object_id`, and a `timestamp`/`request_id` for deduplication.

### `POST /api/event`
**Request body:**
```json
{
  "avatar": "uuid",
  "action": "hud_tick | zone_tick | honey_use | sit | unsit | claim_ritual",
  "zone": number,
  "watchers": number,
  "object": "id",
  "partner": "uuid",
  "group": 0|1,
  "order": "string",
  "honey": "string"
}
```
**Response:**
```json
{
  "state": { /* canonical player subset */ },
  "event": {
    "type": string,
    "winner": string,
    "message": string
  }
}
```

### Session endpoints
- `/api/session/start`: returns `session_id`, `status`, `started_at`.
- `/api/session/tick`: enforces ≥60 s throttle, returns `xp_gained` plus canonical `state`.
- `/api/session/end`: distinguishes partial (15 min) vs full (45 min) rituals, returns completion flag, awarded pentacles, and updated ritual count.
- `/api/honey/use`: 45 min duration, 24 h cooldown, returns updated honey state plus canonical `state`.
- `GET /api/world`: responds with `players[]`, `pairs[]`, `events[]`, `battle{}`, and `metrics{}` for dashboards.

  The `battle` object surfaces the tug-of-war scoreboard:
  - `battle.left` and `battle.right` contain `key`, `label`, `glyph`, `accent`, and accumulated `points` for the two orders currently vying for dominance.
  - `battle.progress` is a 0–100 number showing the left-hand percentage of the ribbon, where the right-hand share is implied.
  - `battle.unicode` is the Unicode ribbon (`▰`/`▱` segments, glyphs, and pentacle center) that the HUD overlays animate.
  - `battle.ticker` and `battle.summary` are short gossip strings describing the current push (ticker for the dopamine line, summary for the feed whisper).

## 3. Redis vs. Database Ownership
| Layer | Responsibilities |
| --- | --- |
| **Redis** | `player:{id}` cache, active sessions, zone pressure, event queue, rate-limiting/dedupe keys, locks |
| **Database** | Persistent tables: players, bonds, rituals history, pentacles, leaderboard snapshots, artifact registry, event log |

> Rule: Redis loss affects live responsiveness; database loss is catastrophic.

## 4. Ritual Phase Model (Authoritative)
State machine: `IDLE → MATCHED (session start) → ACTIVE → PHASE_15 → PHASE_45 → RESOLUTION → COOLDOWN`
- Timing verified server-side; no client trust.
- Duplicate API events are idempotent.
- `PHASE_15`: +25 XP and log event (once per session).
- `PHASE_45`: +75 XP, increment rituals, and apply pentacle reward (winner +5, loser +2.5) via XP comparison or deterministic fallback (once per session).

**Object Authority**
- HUD: UI-only.
- Furniture: fires session events.
- Zone Module: reports presence/zone.
- Admin Panel: forces events.
- Artifact Object: triggers artifact activation.

## 5. XP Curve (Final)
Source of truth: `docs/spec-decision-xp-curve.md`

We use an incremental geometric curve (per-level requirements), tuned so total XP to Level 100 lands around ~1.5M for a 2–3 year target:

- `xp_to_next_level(L) = round(100 * 1.072416^(L-1))` for `L = 1..100`
- `total_xp_to_reach_level(L) = sum_{i=1..L} xp_to_next_level(i)`
- `level` is the largest `L` where `xp >= total_xp_to_reach_level(L)`

**XP sources:** solo tick (~5), pair tick (~10–19), ritual 15 (+25), ritual 45 (+75), drip (0.5–3).
**Multipliers:** honey (Normal 2.0, Dev 5.0, Royal 7.0, Poison 5.0), group 1.15, zone 1.2, bond 1.05, watchers +2% each (max 10%).

## 6. System Refresh & Cooldowns
- Honey: 45 min duration, 24 h cooldown.
- Pentacles: earned through rituals only.
- Surge: triggered by ≥2 players within 7 s; increments `surge_stacks`, ready at ≥2, resets after trigger.
- Daily reset: either rolling 24 h window or fixed UTC midnight (server decision).

## 7. Leaderboard System
- Categories: XP, Bonds, Pair XP.
- Redis maintains real-time standings; snapshots persist every 60 s.
- `/api/world` surfaces leaderboard data; reset monthly.
- Rewards: Rank 1 = Royal Honey, Ranks 2–20 = Dev Honey.

## 8. Broadcast & WebSocket Rules
**Event types:** `ritual_complete`, `zone_flip`, `surge`, `honey_used`, `battle_result`, `artifact_spawn`.
**Flow:** Backend → Redis → WS → HUD/Web.
**Parcel broadcast:** limited to ritual completes, surge events, and battles.

## 9. Networking & Retry Policy
- HTTP: 5 s timeout, ≤3 retries with exponential backoff.
- Redis: failures stall system; no silent fallback.
- Deduplication: require `request_id` or `session_key` per request.
- Failure principle: never double-award.

## 10. Artifact System (Locked)
- Artifacts minted by admins (Azrael/Paul), no RNG.
- Lifetime: 48–72 h. Stored in DB (`artifact_registry`) and Redis for active state.
- Schema: `artifact_id`, `type`, `power_level`, `effect_type`, `duration`, `owner_id`, `location`, `expires_at`.
- Effects: XP boost, zone pressure, ritual modifiers, surge amplification.
- Pentacles pay activation cost (not purchase). Global concurrent active limit.
- Experience layer: HUD has artifact placeholders, backend applies modifiers during XP calc, web UI surfaces active artifacts.

## 11. Core Pipeline (Final)
`LSL → HTTP → Node API → Redis Queue → Worker → Engine → Database → WebSocket → HUD/Web`

## 12. Next Implementation Directives
1. Enforce canonical schema.
2. Refactor all endpoints per contract.
3. Insert Redis queue between API and engine.
4. Add idempotency keys.
5. Implement artifact registry + engine interaction.
6. Add leaderboard snapshot job.
7. Harden WebSocket broadcast layer.
8. Strengthen retry/backoff handling.
9. Validate all event payloads.
10. Remove client-side authority.

## 13. Admin Artifact Operations
- Set `ADMIN_TOKEN` before starting the API so that `POST /api/admin/artifact/spawn` accepts the `X-Admin-Token` or `Authorization: Bearer` header and publishes the guarded `artifact_spawn` event.
- Use `scripts/test-artifact-spawn.js` (npm run `artifact-smoke`) to smoke-test persistence and confirm the `artifact_registered` event lands in `artifact_registry`/`events`.
- Keep the admin tooling documented in `README.md` so future operators know where to look for password rotation or script updates.

*Keep this doc synced with the canonical spec and reference it before implementing new features.*
