JIGSAW LODGE SOCIETY — COMPLETE MASTER SPEC (FULL + NUMERIC)

----------------------------------------
CORE IDENTITY
----------------------------------------

Jigsaw Lodge Society is a persistent MMO system operating inside Second Life.

Server-authoritative architecture
LSL = client input only
Backend = full authority
Real-time event-driven system

----------------------------------------
CORE ARCHITECTURE
----------------------------------------

Second Life → HTTP → Node → Redis → Workers → Database → WebSocket → HUD/UI

Latency target: 50–200ms

O(1) state operations
Stateless Node scaling
Redis = real-time truth layer

----------------------------------------
CORE LOOP
----------------------------------------

Sit → Sync → Bond → Ritual → Reward → Repeat

----------------------------------------
XP MODEL
----------------------------------------

XP_required(level) = 100 * (1.12 ^ (level - 1))

Reference:
Level 1 = 100
Level 10 = 310.58
Level 25 = 1701.82
Level 50 = 28925.47

baseXP = 100

synergyMultiplier(players) = 1 + (players * 0.15)

groupMultiplier = 1.15
groupCondition = bondedPlayers >= 2

zoneMultiplier = 1.20
zoneCondition = player inside active zone

Design:
Fast onboarding
Mid-game slowdown
Late-game exponential scaling

----------------------------------------
FINAL XP FORMULA
----------------------------------------

XP =
baseXP
* players
* (1 + (players * 0.15))
* honeyMultiplier
* groupMultiplier
* zoneMultiplier

Example:
players = 3

XP =
100
* 3
* 1.45
* 1.75
* 1.15
* 1.20

XP = 1045.35

----------------------------------------
RITUAL SYSTEM
----------------------------------------

Requires paired interaction
ritualDuration = 2700 seconds
testDuration = 300 seconds

Generates:
Ritual count
Pentacles

----------------------------------------
BOND SYSTEM
----------------------------------------

Formed through shared sessions

Drives:
Leaderboards
Social dependency
Retention

----------------------------------------
HONEY SYSTEM
----------------------------------------

Types:
Dev Honey (XP boost)
Royal Honey (high-value reward)
Poison Honey (disruption)

honeyMultiplier = 1.75
honeyDuration = 2700
honeyCooldown = 86400

pressureMultiplier = 1.50

Rules:
Server-controlled
No stacking
honeyStacking = FALSE

----------------------------------------
PENTACLE ECONOMY
----------------------------------------

pentaclesPerRitual = 0.01
pentacleConversion = 100 rituals = 1 pentacle

royalHoneyCost = 25 rituals (manual trade)

----------------------------------------
ZONE WARFARE
----------------------------------------

pressureGain =
players * 0.2 * orderMultiplier

pressureScale = 1 + (players * 0.25)

pressureDecay:
pressure *= 0.98 every 500ms

zoneFlipCondition:
pressure >= 100

Balancing:
dominantFactionMultiplier ≈ 0.85
weakFactionMultiplier ≈ 1.25

----------------------------------------
HEATMAP SYSTEM
----------------------------------------

activityScore =
(rituals * 1.0)
+ (players * 2.0)
+ (events * 5.0)

States:
0–50 = Low
50–150 = Active
150–300 = Hot
300+ = Critical

----------------------------------------
RETENTION MODEL
----------------------------------------

day1 = 1.00
day3 = 0.95
day7 = 0.90
day14 = 0.85
day30 = 0.80

Reinforced by:
Delayed rewards
Scarcity loops
Social pressure
Visual feedback

----------------------------------------
SURGE SYSTEM
----------------------------------------

Trigger:
timeWindow = 7 seconds
players >= 2
same zone required

Effect:
surgeXPBonus = 1.25
XP spike
Cinematic overlay
Backend event

----------------------------------------
HUD SYSTEM
----------------------------------------

Displays:
XP
Rituals
Bonds
Pentacles

Features:
Unicode UI (no textures)
Chromatic phase system
Pulse + animation states
Hidden percentage flash logic

----------------------------------------
CHROMATIC PHASE SYSTEM
----------------------------------------

Range: 0–100%
Step: 2.5%

Drives:
Color
Intensity
Feedback loop

----------------------------------------
EVENT PIPELINE
----------------------------------------

HUD → HTTP → Node → Redis → Event → WebSocket → HUD/UI

Latency ≈ 120ms

----------------------------------------
BACKEND SYSTEM
----------------------------------------

Stack:
Node.js (API)
Redis (real-time state)
PostgreSQL / SQLite (persistence)
WebSocket (live updates)

Endpoints:
/api/event
/api/session
/api/sync
/api/world

----------------------------------------
DATA MODEL
----------------------------------------

Player:
XP
Rituals
Bonds
Pentacles
Honey state
Order

Zone:
Pressure
Owner
Player set

Events:
Ritual complete
Zone flip
Surge
Honey usage

----------------------------------------
SECURITY MODEL
----------------------------------------

No client trust
Server validation only
Rate limiting enforced
Token authentication
Anti-spam protection

----------------------------------------
RATE LIMITING
----------------------------------------

minRequestInterval = 800ms
rejectIfBelow = 800ms

----------------------------------------
API RETRY LOGIC
----------------------------------------

retryAttempts = 3
retryDelay = 500ms

----------------------------------------
HUD TIMING CASCADE
----------------------------------------

0ms = input
10ms = HTTP send
100ms = response
120ms = assign values
140ms = compute
150ms = render

----------------------------------------
EVENT LOOP
----------------------------------------

mainLoop = 500ms

Handles:
zone decay
cleanup
state updates

----------------------------------------
ECONOMY FLOW
----------------------------------------

sessionLength = 900 seconds

perSession:
10–20 rituals
0.1–0.2 pentacles
progress toward honey

Flow:
time → rituals → pentacles → honey → power

Controls:
Cooldowns
Admin-controlled scarcity
No RNG

----------------------------------------
ARTIFACT SYSTEM
----------------------------------------

spawn = admin only
TTL = 48–72 hours
dropChance = 0

----------------------------------------
REWARD TIMING
----------------------------------------

microRewardInterval = 30–90 seconds
majorRewardInterval = 300–600 seconds

----------------------------------------
SESSION TARGET
----------------------------------------

sessionTarget = 600–1500 seconds

----------------------------------------
SYSTEM CAPACITY
----------------------------------------

perNodeCapacity = 100–150 concurrent players
clusterScaling = horizontal

Supports:
100–500 concurrent users per cluster

----------------------------------------
ADDICTION / ENGAGEMENT MODEL
----------------------------------------

Layers:
1. Micro rewards (ritual ticks)
2. Milestone spikes (100 rituals)
3. Social pressure (global feed)
4. Scarcity (honey, artifacts)
5. Anticipation (delayed rewards)

----------------------------------------
ENGINEERING VALIDATION
----------------------------------------

Reviewed by:
33-role engineering model

Focus:
Architecture stability
Event pipeline
Scalability
Security

Score target:
999 / 999

Current trajectory:
~822 → projected 930+

----------------------------------------
CURRENT STATUS
----------------------------------------

Backend operational
Core loop validated
Economy controlled
HUD system complete
Real-time pipeline functional

Status:
Pre-launch → scale testing

----------------------------------------
DEMO REQUIREMENTS
----------------------------------------

Ritual session recording
HUD overlay capture
Zone flip live
Backend dashboard
Event feed logs

Output:
60–120 second proof video

----------------------------------------
FINAL POSITIONING
----------------------------------------

Not content-driven
Not quest-driven

System type:
Behavioral MMO infrastructure
Territory control system
Economic progression engine

Category:
MMO Infrastructure Layer

----------------------------------------
