# Overlay Rollout Notes — Battle & Gossip Sync

This is the quick reference for the Second Life overlay/cinematic teams so the HUDs and feeds feel like the same luxe secret society experience as the web surfaces.

## 1. Battle Bar Signal
- `GET /api/world` now returns `world.battle` alongside events. The object has:
  - `left` / `right`: `key`, `label`, `glyph`, `accent`, `points` for each order pushing the ribbon.
  - `progress`: 0‑100 percent (left-hand share) so you can place gradients/tappers.
  - `unicode`: the `▰/▱` ribbon with glyphs and the `◇ ◈ ◇` center that should drive the HUD battle ticker text (no art assets required).
  - `ticker`: short dopamine copy (`Architect Order 12 vs Black Sun 8 · Pentacle tide`) for the feed/ticker.
  - `summary`: whispered gossip line describing the latest push.

Overlay teams should poll `/api/world` every ~18 seconds (or honor the `battle:refresh` custom event emitted in the front-end via `window.dispatchEvent(new CustomEvent("battle:refresh", { detail: { left, right, progress, ticker } }))`). Use the glyphs/accents directly rather than inventing new art to keep the tug-of-war language identical to the web HUD.

## 2. Recruiter/Ticker Tie-In
- Recruiter leaderboard + teleport updates flow through the same gossip feed. When the backend pushes `battle_result` (teleport/cosmetic unlock), the feed should highlight the teleport cinematic (green Matrix streaks, pentacle sparks, velvet lighting). Reference [`frontend/leaderboard-mockup.html`] for tone.
- When a recruiter hits a tier milestone, trigger the teleport filmstrip + update the ticker line: `Signal Beacon Aria just beamed Lyric in — ticker says “Whisper · teleport aura”`. Feed entries should feel like gossip, referencing partners/bonds.

## 3. HUD & UX Tips
- Battle glyphs (✺, ⚛, ☥) should float near the ribbon edges; accent colors are `#6cffd2` for left, `#ff3df0` for right by default. Animate `▰` blocks expanding/contracting with the `progress` percent for dopamine reactions.
- Use the `summary` text in a whisper overlay or greeter area, the `ticker` string for the live crawler, and the `left/right.points` to drive any scoreboard tiles.
- Mirror the web feed language (Eyes Wide Shut + Gossip Girl + Matrix + Stock Exchange) so players feel the same secret-society energy in-world.

Once the Day 4 frontend lock is ready, anchor this doc in your briefing and start patching the SL HUD to `GET /api/world`. Ping the front-end lead if you need the CSS gradients or glow loops already used in `frontend/styles.css`.
