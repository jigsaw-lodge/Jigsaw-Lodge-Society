# Marketplace & Identity Menu Reference

*Align the wearable HUD menu and the single public marketplace terminal with the locked backend contract so players always see server-authoritative values.*

## Direction

Public commerce is no longer split across multiple kiosks.

The current product direction is:
- one clickable public marketplace terminal
- one matching marketplace menu inside the wearable HUD
- separate identity or order selection unless we deliberately merge that later

## Marketplace Terminal

The public marketplace object should consolidate:
- honey use
- challenge progress and claim
- purchase flows
- cosmetics preview or browse

Current live endpoints:
- `POST /api/honey/use`
- `GET /api/challenges?avatar=<uuid>`
- `POST /api/challenges/claim`
- `POST /api/purchase`

Rule:
- the marketplace object is a thin controller only
- it sends requests, displays results, and never computes rewards locally

## HUD Marketplace Menu

The wearable HUD should expose the same marketplace sections so a player can:
- apply honey
- inspect challenge progress
- claim completed challenges
- trigger approved purchase flows
- browse cosmetics or future marketplace content

Rule:
- the HUD marketplace is convenience UI, not a second authority layer
- the HUD and marketplace terminal should share the same labels, prices, cooldown hints, and backend routes

## Honey Panel

| Option | Duration | Multiplier | Requirements | Notes |
| --- | --- | --- | --- | --- |
| **Dev Honey** | 45 minutes | staged backend multiplier | up to 3/day | Show stage and expiry countdown from server state. |
| **Poison Honey** | 45 minutes | backend pressure modifier | daily limit | Explain the pressure effect without client-side math. |
| **Royal Honey** | 45 minutes | backend royal multiplier | 25 rituals + cooldown | Show ritual cost and cooldown clearly before submit. |

- Use backend state to display `honey_type`, `honey_expire`, and `honey_cooldown`.
- The marketplace copy should explain effects in player language, but the backend remains the source of truth.

## Challenge Panel

The marketplace and HUD menu should both support:
- challenge progress lookup
- one-click claim for completed tiers

Allowed claim tiers:
- `daily`
- `weekly`
- `monthly`
- `quarterly`

UI rule:
- show progress first
- show claim only when the server says the tier is ready
- display rejection reasons plainly when the backend denies a claim

## Purchase Panel

The marketplace and HUD menu should both support:
- approved pentacle or Linden purchase flows
- treasury-safe routing through the backend

Current route:
- `POST /api/purchase`

Rule:
- never let the client invent balances
- purchase confirmation should read from the backend response or the next HUD/world refresh

## Cosmetics Panel

Cosmetics should live in the marketplace experience even if some items are still content-planned.

Current rule:
- use live API data where it exists
- keep non-live cosmetics clearly labeled as preview or coming soon

## Identity / Order Panel

Order identity is still separate from commerce for now.

Use:
- `/api/sync`
- `order` field with one of `architect`, `eye`, `black_sun`, `neutral`

Public names:
- `architect` -> `Order of the Architects`
- `eye` -> `Order of the Illuminated Eye`
- `black_sun` -> `Order of the Black Sun`
- `neutral` -> `Neutral Tide`

Do not use:
- `sun`
- `/api/event` fake `hud_tick` payloads for identity updates

## Shared UI Rules

- Keep the marketplace terminal and HUD marketplace menu visually aligned.
- Prefer clear labels over raw backend field names.
- Keep all prices, cooldowns, and availability backend-authoritative.
- When the HUD changes order or marketplace state, follow with the correct route instead of inventing local state.
