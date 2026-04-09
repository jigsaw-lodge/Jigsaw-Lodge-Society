# Jigsaw Lodge Society - Unified Master System + Experience Layer (Absolute Final)

Captured from user-provided spec text.
Date captured: 2026-04-09 (UTC)

----------------------------------------
CORE IDENTITY
----------------------------------------

Persistent behavioral MMO infrastructure operating inside Second Life.

- Server authoritative
- LSL = client input/output only
- Backend (Node + Redis) = full authority
- Event-driven architecture
- Real-time WebSocket feedback

Pipeline:
Second Life -> HTTP -> Node -> Redis -> Event -> WebSocket -> HUD/Web

Latency Target: 50-200ms
Redis = real-time truth layer
Node = stateless horizontal scaling

----------------------------------------
CORE LOOP
----------------------------------------

Sit -> Sync -> Bond -> Ritual -> Reward -> Drip -> Compete -> Repeat

Reinforced by:
- social visibility
- delayed rewards
- territory pressure
- progression escalation

----------------------------------------
XP SYSTEM
----------------------------------------

XP_required(level) =
100 * (1.12 ^ (level - 1))

Reference:
L1 = 100
L10 ~= 310
L25 ~= 1700
L50 ~= 28,900
L100 ~= 900,000

PHASES:
- 1-40   -> onboarding
- 40-80  -> engagement
- 80-100 -> escalation
- 100+   -> ASCENSION

----------------------------------------
ACTIVE XP (CAPPED)
----------------------------------------

baseXP = 100

synergyMultiplier = 1 + (players * 0.15)

groupMultiplier = 1.15
zoneMultiplier = 1.20
groupTagMultiplier = 1.05

MAX_MULTIPLIER = 4.0

rawXP =
baseXP
* synergyMultiplier
* honeyMultiplier
* groupMultiplier
* zoneMultiplier
* groupTagMultiplier

XP =
baseXP * min(rawMultiplier, MAX_MULTIPLIER)

----------------------------------------
PASSIVE XP (DRIP)
----------------------------------------

interval = 60s
baseDripXP = 12

dripXP =
baseDripXP
* zoneMultiplier
* groupTagMultiplier
* (1 + (players * 0.05))

Rules:
- >= 1 ritual/day required
- idle > 120s -> stop
- daily reset (UTC)

----------------------------------------
HONEY SYSTEM
----------------------------------------

Dev Honey:
1.75 -> 2.0 -> 2.25 (max 3/day)

RULE:
- active XP only

Poison Honey:
pressureMultiplier = 1.5

Royal Honey:
cost = 25 rituals
duration = 2700s
cooldown = 86400s

----------------------------------------
PENTACLE ECONOMY
----------------------------------------

pentaclesPerRitual = 0.06

Battle:
- winner = 5
- loser = 2.5

----------------------------------------
ZONE WARFARE
----------------------------------------

pressure += (players ^ 0.75) * 0.2 * orderMultiplier

dominant -> 0.85
weak -> 1.25

decay:
pressure *= 0.98 every 500ms

flip >= 100

----------------------------------------
SURGE SYSTEM
----------------------------------------

Trigger:
>= 2 players within 7s

Charge:
+10 per interaction
100 = ready

Effect:
+25% XP burst

----------------------------------------
CATCH-UP SYSTEM
----------------------------------------

below average:
+10-25% XP

----------------------------------------
ASCENSION SYSTEM (100+)
----------------------------------------

At Level 100:
- levels hidden
- replaced by titles
- progression becomes unstable

----------------------------------------
ASCENSION XP STRUCTURE
----------------------------------------

XP_100 ~= 900,000

101-110 -> +12%
111-125 -> +18%
126-140 -> +28%
141-145 -> +35%
146-150 -> +40%

----------------------------------------
ASCENSION TITLES
----------------------------------------

[120] Watcher of Watchers
[130] Echo Distortion
[140] Reality Desync
[150] ▵ YOU ARE KNOWN ▵

(Full table internally defined)

----------------------------------------
----------------------------------------
UI EXPERIENCE LAYER
----------------------------------------
----------------------------------------

CORE PRINCIPLE:
Clarity decreases as power increases

Transforms system into:
- emotional amplifier
- observable hierarchy
- myth-generation surface

----------------------------------------
ASCENSION DISTORTION STATES
----------------------------------------

NORMAL (<= 100)
- exact values
- stable UI

UNSTABLE (101-130)
- rounded values
- minor inconsistency

DISTORTED (131-140)
- fluctuating values
- partial corruption

MYTH (141-150)
- hidden data
- symbolic output

----------------------------------------
XP DISPLAY
----------------------------------------

NORMAL:
"1,245.3 XP"

UNSTABLE:
"~1.2M+"

DISTORTED:
"SIGNAL: UNSTABLE"

MYTH:
"SIGNAL: █████"

----------------------------------------
LEVEL DISPLAY
----------------------------------------

<= 100:
LVL X

> 100:
TITLE replaces level

----------------------------------------
PROGRESS DISPLAY
----------------------------------------

<= 100:
exact %

101-130:
rounded (10% steps)

131-140:
±3% fluctuation

141-150:
randomized

----------------------------------------
EVENT FEED SYSTEM
----------------------------------------

RITUAL:
"{player} completed a ritual"

ASCENSION:
"▵ {player} HAS BEEN RECOGNIZED ▵"

ZONE:
"Zone claimed by {order}"

SURGE:
"{player} triggered a surge ⚡"

HONEY:
"{player} consumed {type} honey"

----------------------------------------
REVELATION EVENTS
----------------------------------------

Trigger:
ascension unlock

Effects:
- full UI flash
- chromatic surge
- global broadcast

----------------------------------------
VISUAL BEHAVIOR
----------------------------------------

SURGE READY:
- pulsing glow indicator

RIVAL HIGHLIGHT:
- stronger players highlighted

LIVE INTENSITY:
- UI brightness tied to activity

ASCENSION FLASH:
- screen-wide pulse

LEADERBOARD MOTION:
- subtle dynamic movement

----------------------------------------
EMOTIONAL DRIVERS
----------------------------------------

JEALOUSY:
visible gaps + rivals

CURIOSITY:
hidden values

ANTICIPATION:
unstable progress

RECOGNITION:
global events

----------------------------------------
VISIBILITY OF POWER
----------------------------------------

Low level:
- clear
- readable

High level:
- abstract
- distorted
- symbolic

----------------------------------------
FINAL POSITIONING
----------------------------------------

Not a game.

A:
- behavioral reinforcement engine
- social pressure system
- territory control MMO
- economic progression network
- observable power hierarchy

----------------------------------------
END OF UNIFIED SYSTEM
----------------------------------------
