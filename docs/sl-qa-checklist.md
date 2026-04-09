# Second Life QA Checklist (End-to-End)

Goal: prove SL -> HTTP -> Node -> Redis -> Worker -> WebSocket -> HUD/Web is functioning.

## Preconditions
- Stack is up and green:
  - `env ADMIN_TOKEN=... bash scripts/hasan-daily-run.sh`
- You have the HUD script ready in SL:
  - `lslexternals-2026-04-08/jls_hud_v68.ll`
  - or `lslexternals-2026-04-08/jls_hud_minimal_io_v1.ll`
- You have the object setup guide open:
  - `docs/sl-object-setup-guide.md`
- If signing is enabled:
  - your object sends `timestamp`, `request_id`, and `signature`
  - you have `docs/sl-request-signing.md` open while testing

## 1. HUD boots and syncs
1. Attach HUD in SL.
2. Confirm you see:
   - `"JLS HUD boot complete."` when using `jls_hud_v68.ll`
   - or `"JLS minimal HUD ready."` when using `jls_hud_minimal_io_v1.ll`
3. Confirm it starts showing non-zero values after a minute of play:
   - Lvl, rituals, bonds, watchers, pentacles.

Note:
- the minimal HUD is the cleanest backend verification script, but it still needs its first real compile/run proof in-world

Pass when:
- HUD continues to render without errors.
- HUD values change over time (not stuck at zero forever).

## 2. Server receives HUD ticks
Pass when:
- Backend logs show steady `/api/event` traffic for your avatar.

## 3. Session loop (furniture)
1. Sit on the furniture.
2. Wait for ticks.
3. End the session (stand).

Pass when:
- No double-awards.
- If using legacy furniture, `sit` and `unsit` still route into the authoritative session engine.
- Session end is reflected in recent events (`/api/world`).

## 4. Honey and drip rules
1. Use honey.
2. Verify active XP changes (if surfaced).
3. Verify drip stops if idle > 120s.

Pass when:
- Honey state is consistent and cooldown behavior matches rules.
- Drip respects ritual prerequisite (>=1 ritual/day).

## 5. Relay feed visibility (web)
1. Open the web UI served by the backend.
2. Confirm feed events appear (artifact, battle, ritual, surge).

Pass when:
- You can see real-time feed updates without refreshing.

## 6. Failure drill (quick)
1. Restart relay.
2. Confirm clients reconnect or the HUD continues polling.

Pass when:
- Recovery takes seconds, not hours.

## Evidence to record
- date/time
- which HUD version
- one screenshot of HUD state
- one screenshot of web feed
- one artifact smoke pass (or admin spawn)

If the pass breaks:
- stop and use `docs/sl-troubleshooting.md`
