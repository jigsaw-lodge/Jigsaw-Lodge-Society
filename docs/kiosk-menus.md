# Honey & Order Kiosk Menu Reference

*Align the HUD, honey shop, and order kiosk menus with the locked canonical spec so players always see the server-authoritative values.*

## Honey Kiosk
| Option | Duration | Multiplier | Requirements | Notes |
| --- | --- | --- | --- | --- |
| **Normal Honey** | 45 minutes | 2.0x | None | Default timer displayed on HUD `🍯`. Falls back to `feeds` described in `docs/canonical-system-spec.md`. |
| **Dev Honey** | 30 minutes (stage 1/2/3; up to 3/day) | 3.0x (staged, `HONEY_STAGES`) | None beyond admin/ritual access | HUD should show `Dev Honey ▸ Stage X` and expiration countdown. |
| **Poison Honey** | 30 minutes | 3.0x | 3/day, self-use only | Display the pressure multiplier (1.5) from the spec and the shared cooldown indicator. |
| **Royal Honey** | 15 minutes | 7.0x | 25 rituals + 24h cooldown | Require ritual burn-in before granting; HUD must indicate the Royal cooldown timer and the ritual cost. |

- Display the `honey_expire`, `honey_cooldown`, and `honey_type` values from `docs/canonical-system-spec.md` so the HUD never exposes raw authority state, just countdowns and tags.
- The honey kiosk menu should expose tooltip text describing the effect type (`xp_boost`, `zone_pressure`, etc.) so players understand what modifiers the backend applies during XP calculation.
- Keep the kiosk networking side as a thin controller; it should raise `honey_use` events for the backend to validate instead of trying to compute multipliers.

## Order Kiosk
- Present the four canonical orders (`architect`, `eye`, `black_sun`, `neutral`) in a static menu; selecting an order sends the `order` string through the HUD so the backend can stamp the authoritative `order` field.
- Render the public names clearly in the kiosk copy:
  - `architect` -> `Architect Order`
  - `eye` -> `Order of the Illuminated Eye`
  - `black_sun` -> `Black Sun`
  - `neutral` -> `Neutral Tide`
- Include a `Choose Order` button that links to HUD settings, but forbid any client-side creation of new order IDs—the backend remains the single source of truth for `order` strings.
- Document the `order` change confirmation flow so HUD feedback (color changes, HUD halos) matches the spec’s visibility-of-power goals.

## HUD Integration Notes
- The HUD honey menu must read the server response (via `/api/event`/`poll`) and then update the timer portion (`🍯 timer`) to reflect `honey_expire` and `honey_type`.
- Order changes triggered from the kiosk should update the HUD’s bonded badge and send a follow-up `/api/sync` call so the backend logs the new `order` immediately.
- Reference the canonical spec whenever adjusting UI copy so the HUD never drifts from the multipliers, cooldowns, or order names defined by the server.
