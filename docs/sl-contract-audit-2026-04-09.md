# Second Life Contract Audit - 2026-04-09

This audit covers the checked-in Second Life assets and compares them to the current backend contract.

## Scope

Reviewed:
- `lslexternals-2026-04-08/jls_hud_v68.ll`
- `docs/hud-contract.md`
- `docs/sl-request-signing.md`
- `docs/lslexternals-2026-04-08.md`

Important limit:
- the repo currently includes the HUD source file, but not the actual chair, zone beacon, honey kiosk, order console, or other object scripts mentioned in the bundle doc
- those non-HUD objects can only be audited from documentation today, not from real source

## What matches the contract

- `jls_hud_v68.ll` posts to `/api/event`, which is still the correct HUD polling endpoint
- it sends `avatar`, `object`, and `action: "hud_tick"`
- it expects and consumes the backend `state` payload fields:
  - `level`
  - `rituals`
  - `bonds`
  - `watchers`
  - `pentacles`
  - `ritual_progress`
  - `honey`
  - `honey_expire`
  - `surge_ready`
- it already uses a 2-second poll interval, which fits the current rate-limit guidance
- it has retry and fallback behavior for endpoint failures

## What does not match the contract

### 1. No auth fields are sent

Current HUD v68 does **not** send:
- `token`
- `timestamp`
- `request_id`
- `signature`

That means:
- it will only work while the backend still allows unsigned traffic
- it is not ready for enforced signed SL requests

### 2. The script is more theatrical than operational

The current HUD includes:
- a weighted boot animation system
- rotating symbols
- dynamic text decoration

That is not wrong, but it increases client-side complexity while giving no gameplay authority benefit.

For first-pass debugging and contract verification, it is heavier than necessary.

### 3. The bundle references objects whose source is not in the repo

The bundle doc names these objects:
- chair event anchor
- event feedback layer
- zone beacon
- world feed board
- leaderboard board
- honey kiosk
- admin utility
- order console

But their actual LSL source files are not checked in here.

That means the full Second Life layer is **not fully source-audited yet**.

### 4. Session authority has moved

The backend now treats the authoritative ritual loop as:
- `/api/session/start`
- `/api/session/tick`
- `/api/session/end`

Legacy chair actions like `sit`, `ritual_tick`, `stand`, and `unsit` are still bridged through `/api/event`, but that is compatibility behavior, not the target architecture.

## Decisions

### Keep HUD v68

Keep `jls_hud_v68.ll` as:
- the themed presentation HUD
- a visual bundle artifact

### Add a minimal testing HUD

Use `lslexternals-2026-04-08/jls_hud_minimal_io_v1.ll` as:
- the clean reference HUD
- the easiest beginner-safe script for backend verification
- the first HUD to update when signed SL traffic is being rolled out
- a source-reviewed reference that still needs its first real compile/run proof in Second Life

### Do not overclaim the audit

We can honestly mark the current checked-in HUD audit complete, but we should **not** claim the entire SL object suite is fully audited until the other object scripts are added to the repo or exported for review.

## Recommended next follow-up

1. Use the minimal HUD for the first real SL golden path.
2. Export the chair and other object scripts into the repo.
3. Audit those object scripts against:
   - `docs/hud-contract.md`
   - `docs/sl-request-signing.md`
   - `docs/sl-object-setup-guide.md`
