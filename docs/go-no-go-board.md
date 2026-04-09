# Go / No-Go Board

This is the founder-friendly launch call sheet for Task 95.

If you only want the short truth, read this file and [launch-100-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/launch-100-checklist.md).

## Call right now
- `NO-GO` for saying "100% MMO ready"

## Why it is not go yet
- we still need one real SL end-to-end capture from object -> API -> worker -> relay -> HUD/web
- the current non-HUD LSL object suite is not exported into the repo yet
- the current build still needs a fresh load test and PUB/SUB proof sweep
- signed SL traffic exists in code, but production enforcement still needs the deployed `JLS_SIGNING_SECRET` plus updated objects

## What is already green
- API health is green
- worker heartbeat is green
- relay health is green
- artifact smoke passed on the current build
- backend suite passed `33/33`
- backups and restore drill passed on the current build
- weekly release gate passed on the current build
- website observer surface is using real health, feed, battle, and snapshot data
- the LSL testing manifest now exists in [JLS_FULL_TESTING_PACKAGE.txt](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/lslexternals-2026-04-08/JLS_FULL_TESTING_PACKAGE.txt)

## What must happen before go
1. Run one full SL golden path and archive the evidence.
2. Export the remaining chair, zone, artifact, kiosk, and console scripts into the repo.
3. Rerun the current-build load test and PUB/SUB benchmark.
4. Deploy `JLS_SIGNING_SECRET`, update the objects, and then enable `JLS_REQUIRE_SIGNED_REQUESTS=1`.

## Simple founder read
- Backend prep: strong
- Website observer: strong
- Operations and recovery: strong
- In-world proof on the current build: not complete yet
- Final launch claim: not honest yet

## Go trigger
Flip this board to `GO` only when all four "must happen before go" items are complete and reflected in [launch-100-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/launch-100-checklist.md).
