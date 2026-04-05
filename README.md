JIGSAW LODGE SOCIETY — COMPLETE MASTER SPEC (ABSOLUTE FINAL)

----------------------------------------
CORE IDENTITY
----------------------------------------

Persistent MMO infrastructure inside Second Life

Server-authoritative
LSL = client only
Backend = full authority
Event-driven system

Official system hub:
jigsawlodgesociety.com (ALL data, identity, and validation originates here)

----------------------------------------
CORE LOOP
----------------------------------------

Sit → Sync → Bond → Ritual → Reward → Drip → Compete → Repeat

----------------------------------------
XP MODEL
----------------------------------------

XP_required(level) = 100 * (1.12 ^ (level - 1))

baseXP = 100

synergyMultiplier = 1 + (players * 0.15)

groupMultiplier = 1.15
zoneMultiplier = 1.20
groupTagMultiplier = 1.05

----------------------------------------
ACTIVE XP
----------------------------------------

XP =
baseXP
* players
* synergyMultiplier
* honeyMultiplier
* groupMultiplier
* zoneMultiplier
* groupTagMultiplier

----------------------------------------
PASSIVE XP (DRIP)
----------------------------------------

interval = 60s
baseDripXP = 5

dripXP =
baseDripXP
* honeyMultiplier
* zoneMultiplier
* groupTagMultiplier

DRIP UNLOCK RULE:
- MUST complete ≥1 ritual that day
- Otherwise dripXP = 0

DAILY RESET:
- Server UTC reset
- ritualCountToday → 0

ANTI-AFK:
- Stops if idle > 120s

----------------------------------------
HONEY SYSTEM (OPTION B)
----------------------------------------

Dev Honey Scaling:

use1 = 1.75
use2 = 2.00
use3 = 2.25
hardCap = 2.25

cost_devHoney_L$ = 80
maxUsesPerDay = 3
giftablePerDay = 3

Poison Honey:
pressureMultiplier = 1.50
cost_poisonHoney_L$ = 80
maxUsesPerDay = 3

Royal Honey:
cost = 25 rituals

duration = 2700s
cooldown = 86400s

----------------------------------------
TREASURY SYSTEM
----------------------------------------

treasury += all L$ purchases

----------------------------------------
BATTLE SYSTEM
----------------------------------------

winnerReward = 5 pentacles
loserReward = 2.5 pentacles

----------------------------------------
PENTACLE ECONOMY
----------------------------------------

pentacleGlyph = ◈

pentaclesPerRitual = 0.01

----------------------------------------
COSMETIC ECONOMY
----------------------------------------

cosmetic_L$:
250L / 500L

cosmetic_pentacles:
2 / 5 / 10

----------------------------------------
JEALOUSY SYSTEM
----------------------------------------

Triggers:
- Others gaining faster
- Friends surpassing
- Zone loss

Effects:
- HUD highlight rivals
- Feed prioritization
- Loss amplification

----------------------------------------
ZONE WARFARE
----------------------------------------

pressure += players * 0.2 * orderMultiplier

dominant = 0.85
weak = 1.25

decay:
pressure *= 0.98 / 500ms

flip >= 100

----------------------------------------
SURGE SYSTEM
----------------------------------------

timeWindow = 7s
players >= 2

surgeXPBonus = 1.25

SURGE READINESS:

surgeCharge = 0 → 100

+10 per valid interaction
decays slowly if inactive

⚡️ = ready when ≥100

----------------------------------------
CHALLENGE SYSTEM (FULL)
----------------------------------------

DAILY:
- 3–5 objectives
- reward:
  +5–10% XP boost (temporary)
  OR +1 ritual
  OR +0.25 pentacles

WEEKLY:
- 5–10 objectives
- reward:
  +15–25% XP boost
  OR +3 rituals
  OR +1 pentacle

MONTHLY:
- major milestones
- reward:
  +25–50% XP boost
  OR +10 rituals
  OR +3 pentacles

QUARTERLY:
- long-term grind goals
- reward:
  exclusive cosmetics
  OR +5 pentacles
  OR Royal Honey

Rules:
- Server tracked
- No stacking abuse
- Limited active objectives

----------------------------------------
EQUIPMENT SYSTEM (DIAMONDS)
----------------------------------------

diamondSlots = 3

glyph = ◆

Each slot:
◆ ◆ ◆

Equipable items:
- cosmetic modifiers
- aura effects
- title modifiers

Rules:
- Max 3 equipped
- No stat stacking beyond allowed caps

----------------------------------------
HUD SYSTEM (FULL VISUAL SPEC)
----------------------------------------

▵JIGSAW LODGE SOCIETY▵
[Title]

LVL X • △Rituals • ⛓Bonds • 👁XP

◆ ◆ ◆

◇═══◇════◇════◇═══◇
◆████████░░◆
◇═══◇════◇════◇═══◇

🍯 timer   ◈ pentacles   ⚡️ surge

----------------------------------------
HUD ICON ROW (TEMP SYSTEM STATE)
----------------------------------------

🍯 = honey active timer

◈ = pentacle count (currency)

⚡️ = surge readiness
- fills to active state
- flashes when ready

----------------------------------------
HUD STATES
----------------------------------------

IDLE → PULSE → SPIKE → GLOW → BURST → COOLDOWN

----------------------------------------
CHROMATIC SYSTEM
----------------------------------------

0–100%
2.5% steps
66-phase RGB backend-driven

----------------------------------------
EVENT PIPELINE
----------------------------------------

HUD → HTTP → Node → Redis → Event → WebSocket → HUD/Web

----------------------------------------
WEBSITE REQUIREMENTS
----------------------------------------

jigsawlodgesociety.com:

- profiles
- leaderboard
- live feed
- map
- purchases
- UUID linking

----------------------------------------
EXTERNAL SYSTEMS
----------------------------------------

HUD
Greeter
Furniture (2–8)AVIsitter2
Teleporter
Friends
Recruiter
Leaderboards
Order kiosk
Honey kiosk
Admin panel

----------------------------------------
SECURITY
----------------------------------------

No client trust
Token validation
800ms rate limit
Retry = 3

----------------------------------------
EVENT LOOP
----------------------------------------

500ms

----------------------------------------
SESSION DESIGN
----------------------------------------

600–1500 sec

----------------------------------------
ECONOMY FLOW
----------------------------------------

time → rituals → pentacles → honey → power → dominance

----------------------------------------
SYSTEM CAPACITY
----------------------------------------

100–150 players/node

----------------------------------------
FINAL POSITIONING
----------------------------------------

Behavioral MMO infrastructure
Territory control system
Economic progression engine

----------------------------------------
