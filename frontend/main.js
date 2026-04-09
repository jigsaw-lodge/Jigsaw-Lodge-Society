const body = document.body;
const baseUrl = body.dataset.baseUrl || "/api";
const wsUrl =
  body.dataset.wsUrl ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/`;

const feedEl = document.getElementById("feed");
const whisperEl = document.getElementById("whisper");
const xpEl = document.getElementById("xp");
const xpProfileEl = document.getElementById("xpProfile");
const ascensionEl = document.getElementById("ascension");
const hudLevelEl = document.getElementById("hudLevel");
const ritualsEl = document.getElementById("rituals");
const bondsEl = document.getElementById("bonds");
const watchersEl = document.getElementById("watchers");
const pentaclesEl = document.getElementById("pentacles");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const surgeGauge = document.getElementById("surgeGauge");
const honeyLabel = document.getElementById("honeyLabel");
const honeyTimer = document.getElementById("honeyTimer");
const avatarInput = document.getElementById("avatarId");
const partnerInput = document.getElementById("partnerId");
const connectBtn = document.getElementById("connectBtn");
const startBtn = document.getElementById("startSession");
const tickBtn = document.getElementById("tickSession");
const endBtn = document.getElementById("endSession");
const dripBtn = document.getElementById("dripButton");
const honeyTypeSelect = document.getElementById("honeyType");
const applyHoneyBtn = document.getElementById("applyHoney");
const revealEl = document.getElementById("reveal");
const activationEl = document.getElementById("activation");
const TICK_COOLDOWN_MS = 60_000;
let nextTickAt = 0;

const archetypes = {
  surpassed: ["The One Who Surpassed You", "Signal Overwrite"],
  rival: ["The One Behind You", "Close Signal"],
  dominant: ["Watcher Prime", "The Known"],
  unknown: ["Unknown Signal", "██████"],
};

const themes = {
  occult: { slug: "eyes", label: "Eyes Wide Shut", colorClass: "eyes" },
  exchange: { slug: "exchange", label: "Stock Exchange", colorClass: "exchange" },
  matrix: { slug: "matrix", label: "The Matrix", colorClass: "matrix" },
  gossip: { slug: "gossip", label: "Gossip Girl", colorClass: "gossip" },
};

let ascensionLevel = 132;
let unlocked = false;
const state = {
  avatar: "",
  token: "",
  partner: "",
  ritualProgress: 0,
  surgeCharge: 0,
  honeyExpire: 0,
};

const sharedToken = body.dataset.sharedToken || "";
if (sharedToken) {
  state.token = sharedToken;
}

const overlayContainer = document.createElement("div");
overlayContainer.className = "event-overlay-container";
document.body.appendChild(overlayContainer);

const flowListItems = document.querySelectorAll(".flow-list li");
const flowNoteEl = document.querySelector(".flow-note");
const flowNoteDefault = flowNoteEl?.textContent || "Each action nudges the glyph meter; the overlay dramatizes every milestone.";
const flowZonePressureEl = document.getElementById("flowZonePressure");
const flowJealousyEl = document.getElementById("flowJealousy");
const flowChallengeEl = document.getElementById("flowChallenge");
const battleRunnerEl = document.getElementById("battleRunner");
const battleTickerEl = document.getElementById("battleTicker");
const battleSummaryEl = document.getElementById("battleSummary");
const battleLeftNameEl = document.getElementById("battleLeftName");
const battleLeftPointsEl = document.getElementById("battleLeftPoints");
const battleRightNameEl = document.getElementById("battleRightName");
const battleRightPointsEl = document.getElementById("battleRightPoints");
const battlePanelEl = document.getElementById("battleView");
const siteStatusEl = document.getElementById("siteStatus");
const siteStatusHintEl = document.getElementById("siteStatusHint");
const workerStatusMetricEl = document.getElementById("workerStatusMetric");
const workerStatusHintEl = document.getElementById("workerStatusHint");
const relayStatusMetricEl = document.getElementById("relayStatusMetric");
const relayStatusHintEl = document.getElementById("relayStatusHint");
const snapshotTimeEl = document.getElementById("snapshotTime");
const snapshotHintEl = document.getElementById("snapshotHint");
const activeSessionsMetricEl = document.getElementById("activeSessionsMetric");
const activePlayersMetricEl = document.getElementById("activePlayersMetric");
const treasuryMetricEl = document.getElementById("treasuryMetric");
const latestFeedMetricEl = document.getElementById("latestFeedMetric");
const latestFeedHintEl = document.getElementById("latestFeedHint");
const battleStateMetricEl = document.getElementById("battleStateMetric");
const battleStateHintEl = document.getElementById("battleStateHint");
const observerPulseEl = document.getElementById("observerPulse");
const artifactsListEl = document.getElementById("artifactsList");
const zonesEl = document.getElementById("zones");
const relayHealthUrl = deriveRelayHealthUrl();

const observerState = {
  api: { ok: false, label: "Checking", hint: "Waiting for API health", tone: "warn" },
  worker: { ok: false, label: "Checking", hint: "Waiting for heartbeat", tone: "warn" },
  relay: { ok: false, label: "Checking", hint: "Waiting for socket", tone: "warn" },
  snapshotAt: 0,
  battleLabel: "Dormant",
  battleHint: "Waiting for a world snapshot",
  lastFeedLabel: "Waiting",
  lastFeedHint: "No live feed packet yet",
  lastFeedAt: 0,
};

function deriveRelayHealthUrl() {
  try {
    const parsed = new URL(wsUrl);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/health";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function clearStatusTone(el) {
  if (!el) return;
  el.classList.remove("status-good", "status-bad", "status-warn");
}

function applyStatusTone(el, tone) {
  if (!el) return;
  clearStatusTone(el);
  if (tone === "good") el.classList.add("status-good");
  if (tone === "bad") el.classList.add("status-bad");
  if (tone === "warn") el.classList.add("status-warn");
}

function setStatusCard(valueEl, hintEl, label, hint, tone = "warn") {
  if (valueEl) {
    valueEl.textContent = label;
    applyStatusTone(valueEl, tone);
  }
  if (hintEl) {
    hintEl.textContent = hint || "";
  }
}

function formatRelativeTime(timestampMs) {
  if (!timestampMs) return "--";
  const deltaMs = Math.max(0, Date.now() - Number(timestampMs));
  const deltaSeconds = Math.round(deltaMs / 1000);
  if (deltaSeconds < 5) return "just now";
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  return `${deltaHours}h ago`;
}

function formatClockTime(timestampMs) {
  if (!timestampMs) return "--";
  const date = new Date(Number(timestampMs));
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function trimMessage(value, max = 56) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderObserverPulse() {
  if (!observerPulseEl) return;
  const snapshotFresh = observerState.snapshotAt && Date.now() - observerState.snapshotAt <= BATTLE_REFRESH_MS * 2;
  let label = "Observer warming";
  let tone = "warn";
  if (observerState.api.ok && observerState.worker.ok && observerState.relay.ok && snapshotFresh) {
    label = "Observer live";
    tone = "good";
  } else if (observerState.relay.label.toLowerCase().includes("reconnecting")) {
    label = "Relay reconnecting";
    tone = "warn";
  } else if (observerState.api.ok || observerState.worker.ok || observerState.relay.ok) {
    label = "Needs attention";
    tone = "warn";
  } else {
    label = "Observer degraded";
    tone = "bad";
  }
  observerPulseEl.textContent = label;
  observerPulseEl.classList.remove("observer-good", "observer-bad", "observer-pending");
  if (tone === "good") observerPulseEl.classList.add("observer-good");
  else if (tone === "bad") observerPulseEl.classList.add("observer-bad");
  else observerPulseEl.classList.add("observer-pending");
}

function renderObserverCards() {
  setStatusCard(siteStatusEl, siteStatusHintEl, observerState.api.label, observerState.api.hint, observerState.api.tone);
  setStatusCard(
    workerStatusMetricEl,
    workerStatusHintEl,
    observerState.worker.label,
    observerState.worker.hint,
    observerState.worker.tone
  );
  setStatusCard(
    relayStatusMetricEl,
    relayStatusHintEl,
    observerState.relay.label,
    observerState.relay.hint,
    observerState.relay.tone
  );
  setStatusCard(
    snapshotTimeEl,
    snapshotHintEl,
    observerState.snapshotAt ? formatRelativeTime(observerState.snapshotAt) : "--",
    observerState.snapshotAt ? `World generated ${formatClockTime(observerState.snapshotAt)}` : "No world snapshot yet",
    observerState.snapshotAt ? (Date.now() - observerState.snapshotAt <= BATTLE_REFRESH_MS * 2 ? "good" : "warn") : "warn"
  );
  setStatusCard(
    latestFeedMetricEl,
    latestFeedHintEl,
    observerState.lastFeedLabel,
    observerState.lastFeedAt
      ? `${formatRelativeTime(observerState.lastFeedAt)} • ${observerState.lastFeedHint}`
      : observerState.lastFeedHint,
    observerState.lastFeedAt ? "good" : "warn"
  );
  setStatusCard(
    battleStateMetricEl,
    battleStateHintEl,
    observerState.battleLabel,
    observerState.battleHint,
    observerState.snapshotAt ? "good" : "warn"
  );
  renderObserverPulse();
}

function updateObserverHealthState(key, ok, label, hint, tone = ok ? "good" : "bad") {
  observerState[key] = { ok, label, hint, tone };
  renderObserverCards();
}

async function fetchHealthJson(url) {
  if (!url) {
    return { ok: false, label: "Unavailable", hint: "No health URL configured", tone: "warn" };
  }
  try {
    const resp = await fetch(url, { cache: "no-store" });
    const health = await resp.json().catch(() => ({}));
    const healthy = resp.ok && Number(health.ok) === 1;
    return {
      ok: healthy,
      label: healthy ? "Healthy" : `HTTP ${resp.status}`,
      hint: healthy
        ? `redis:${health.redis ?? "?"} • ${formatClockTime(health.time || Date.now())}`
        : trimMessage(health.error || `Health check failed (${resp.status})`, 52),
      tone: healthy ? "good" : "bad",
    };
  } catch (err) {
    return {
      ok: false,
      label: "Offline",
      hint: trimMessage(err.message || "Network error", 52),
      tone: "bad",
    };
  }
}

async function refreshObserverHealth() {
  const [apiState, workerState, relayState] = await Promise.all([
    fetchHealthJson(`${baseUrl}/health`),
    fetchHealthJson(`${baseUrl}/worker/heartbeat`),
    fetchHealthJson(relayHealthUrl),
  ]);
  updateObserverHealthState("api", apiState.ok, apiState.label, apiState.hint, apiState.tone);
  updateObserverHealthState("worker", workerState.ok, workerState.label, workerState.hint, workerState.tone);
  updateObserverHealthState("relay", relayState.ok, relayState.label, relayState.hint, relayState.tone);
}

function recordFeedSignal(typeLabel, message) {
  observerState.lastFeedAt = Date.now();
  observerState.lastFeedLabel = trimMessage(typeLabel || "feed", 30) || "feed";
  observerState.lastFeedHint = trimMessage(message || "Live packet received", 68) || "Live packet received";
  renderObserverCards();
}

function refreshFlowHighlights(value = state.ritualProgress) {
  if (!flowListItems?.length) return;
  flowListItems.forEach((item) => {
    const phase = Number(item.dataset.phase) || 0;
    item.classList.toggle("active", value >= phase);
  });
}

function updateFlowMetadata(payload = {}) {
  if (flowZonePressureEl) {
    flowZonePressureEl.textContent = payload.zone_pressure !== undefined ? `${payload.zone_pressure}%` : "—";
  }
  if (flowJealousyEl) {
    flowJealousyEl.textContent = payload.jealousy_level !== undefined ? `${payload.jealousy_level}%` : "—";
  }
  if (flowChallengeEl) {
    if (
      payload.challenge_daily !== undefined ||
      payload.challenge_weekly !== undefined ||
      payload.challenge_monthly !== undefined ||
      payload.challenge_quarterly !== undefined
    ) {
      const daily = payload.challenge_daily ?? 0;
      const weekly = payload.challenge_weekly ?? 0;
      const monthly = payload.challenge_monthly ?? 0;
      const quarterly = payload.challenge_quarterly ?? 0;
      flowChallengeEl.textContent = `D${daily}% W${weekly}% M${monthly}% Q${quarterly}%`;
    } else {
      flowChallengeEl.textContent =
        payload.challenge_progress !== undefined ? `${payload.challenge_progress}%` : "—";
    }
  }
  if (flowNoteEl) {
    if (payload.zone_pressure !== undefined) {
      const zoneLabel = payload.zone || "0:0";
      const challengeLine = payload.challenge_daily !== undefined
        ? `Challenge D${payload.challenge_daily ?? 0}% W${payload.challenge_weekly ?? 0}% M${
            payload.challenge_monthly ?? 0
          }% Q${payload.challenge_quarterly ?? 0}%`
        : `Challenge ${payload.challenge_progress ?? 0}%`;
      flowNoteEl.textContent = `Zone ${zoneLabel} • Pressure ${payload.zone_pressure}% • Jealousy ${
        payload.jealousy_level ?? 0
      }% • ${challengeLine}`;
    } else {
      flowNoteEl.textContent = flowNoteDefault;
    }
  }
  const highlightValue = payload.challenge_daily ?? payload.challenge_progress ?? state.ritualProgress;
  refreshFlowHighlights(highlightValue);
}

const BATTLE_REFRESH_MS = 18000;

function applyBattlePalette(leftAccent = "#6cffd2", rightAccent = "#ff3df0") {
  if (!battlePanelEl) return;
  battlePanelEl.style.setProperty("--battle-left-color", leftAccent);
  battlePanelEl.style.setProperty("--battle-right-color", rightAccent);
}

function renderBattleBar(battle) {
  if (!battleRunnerEl) return;
  const left = battle?.left || {};
  const right = battle?.right || {};
  battleRunnerEl.textContent = battle?.unicode || "◇ ◈ ◇ awaiting the next push";
  if (battleTickerEl) {
    battleTickerEl.textContent = battle?.ticker || "Ticker sleeping while orders gather";
  }
  if (battleSummaryEl) {
    battleSummaryEl.textContent = battle?.summary || "Battle whisper dormant";
  }
  if (battleLeftNameEl) {
    battleLeftNameEl.textContent = `${left.glyph ?? "◇"} ${left.label ?? "Order"}`;
  }
  if (battleRightNameEl) {
    battleRightNameEl.textContent = `${right.glyph ?? "◇"} ${right.label ?? "Order"}`;
  }
  if (battleLeftPointsEl) {
    battleLeftPointsEl.textContent = `${left.points ?? 0} pts`;
  }
  if (battleRightPointsEl) {
    battleRightPointsEl.textContent = `${right.points ?? 0} pts`;
  }
  applyBattlePalette(left.accent, right.accent);
  window.dispatchEvent(
    new CustomEvent("battle:refresh", {
      detail: {
        left,
        right,
        progress: battle?.progress,
        ticker: battle?.ticker,
      },
    })
  );
}

function renderWorldMetrics(world = {}) {
  const metrics = world.metrics || {};
  observerState.snapshotAt = Number(world.generated_at) || 0;
  const battle = world.battle || {};
  const left = battle.left || {};
  const right = battle.right || {};
  observerState.battleLabel = battle.unicode
    ? `${Math.round(Number(battle.progress) || 0)}% ribbon`
    : "Dormant";
  observerState.battleHint = trimMessage(
    battle.summary
      || battle.ticker
      || `${left.label || "Order"} ${left.points ?? 0} vs ${right.label || "Order"} ${right.points ?? 0}`,
    72
  ) || "Awaiting the next ritual push";
  if (activeSessionsMetricEl) activeSessionsMetricEl.textContent = String(metrics.active_sessions ?? 0);
  if (activePlayersMetricEl) activePlayersMetricEl.textContent = String(metrics.active_players_5m ?? 0);
  if (treasuryMetricEl) treasuryMetricEl.textContent = String(metrics.treasury_total_l ?? 0);
  renderObserverCards();
}

function renderArtifacts(artifacts = []) {
  if (!artifactsListEl) return;
  artifactsListEl.innerHTML = "";

  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "artifact-empty";
    empty.textContent = "No active artifacts in the ledger yet.";
    artifactsListEl.appendChild(empty);
    return;
  }

  artifacts.slice(0, 8).forEach((artifact) => {
    const row = document.createElement("article");
    row.className = "artifact-item";
    const expiresAt = artifact.expires_at
      ? new Date(Number(artifact.expires_at) * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--";
    row.innerHTML = `
      <div>
        <strong>${artifact.type || artifact.artifact_id}</strong>
        <small>${artifact.effect_type || "unknown effect"} • power ${artifact.power_level ?? 0}</small>
      </div>
      <div class="artifact-meta">
        <span>${artifact.location || "unplaced"}</span>
        <span>exp ${expiresAt}</span>
      </div>
    `;
    artifactsListEl.appendChild(row);
  });
}

function renderZones(world = {}) {
  if (!zonesEl) return;
  zonesEl.innerHTML = "";
  const zoneMap = new Map();

  const bumpZone = (zoneName, field) => {
    const zone = String(zoneName || "").trim();
    if (!zone) return;
    if (!zoneMap.has(zone)) {
      zoneMap.set(zone, { zone, sessions: 0, artifacts: 0, events: 0 });
    }
    zoneMap.get(zone)[field] += 1;
  };

  for (const session of world.sessions || []) {
    bumpZone(session.zone, "sessions");
  }
  for (const artifact of world.artifacts || []) {
    bumpZone(artifact.location, "artifacts");
  }
  for (const event of world.events || []) {
    const payload = event?.payload || {};
    bumpZone(payload.zone || payload.location, "events");
  }

  const rows = [...zoneMap.values()].sort((a, b) => {
    const sessionDelta = b.sessions - a.sessions;
    if (sessionDelta) return sessionDelta;
    const worldDelta = (b.artifacts + b.events) - (a.artifacts + a.events);
    if (worldDelta) return worldDelta;
    return a.zone.localeCompare(b.zone);
  });

  const visible = rows.slice(0, 32);
  visible.forEach((item) => {
    const zone = document.createElement("div");
    zone.className = "zone";
    if (item.sessions > 0) zone.classList.add("active");
    else if (item.artifacts > 0 || item.events > 0) zone.classList.add("enemy");
    zone.title = `${item.zone} • sessions ${item.sessions} • artifacts ${item.artifacts} • events ${item.events}`;
    zonesEl.appendChild(zone);
  });

  const targetCount = Math.max(16, visible.length || 16);
  while (zonesEl.children.length < targetCount) {
    const zone = document.createElement("div");
    zone.className = "zone";
    zone.title = "No live zone signal yet";
    zonesEl.appendChild(zone);
  }
}

async function fetchWorldSnapshot() {
  try {
    const resp = await fetch(`${baseUrl}/world`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const payload = await resp.json().catch(() => ({}));
    const world = payload?.world || {};
    renderBattleBar(world.battle);
    renderWorldMetrics(world);
    renderArtifacts(world.artifacts);
    renderZones(world);
  } catch (err) {
    observerState.snapshotAt = 0;
    observerState.battleLabel = "Stale";
    observerState.battleHint = `World snapshot failed (${trimMessage(err.message, 48)})`;
    renderObserverCards();
    console.warn("world snapshot refresh failed", err);
  }
}

function legend(type) {
  const pool = archetypes[type] || archetypes.unknown;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function formatCountdown(ms) {
  const seconds = Math.ceil(ms / 1000);
  return formatTime(seconds);
}

function updateTickCTA() {
  if (!tickBtn) return;
  const remaining = Math.max(0, nextTickAt - Date.now());
  if (remaining > 0) {
    tickBtn.disabled = true;
    tickBtn.textContent = `Tick Ritual (${formatCountdown(remaining)})`;
  } else {
    tickBtn.disabled = false;
    tickBtn.textContent = "Tick Ritual";
  }
}

function armTickCooldown() {
  nextTickAt = Date.now() + TICK_COOLDOWN_MS;
  updateTickCTA();
}

function updateColorPalette(progress) {
  const phase = Math.min(65, Math.max(0, Math.round(progress)));
  const hue = 260 - phase * 2.6;
  const saturate = 60 + phase * 0.5;
  const light = 35 + phase * 0.2;
  document.documentElement.style.setProperty("--progress-hue", hue);
  document.documentElement.style.setProperty("--progress-sat", `${saturate}%`);
  document.documentElement.style.setProperty("--progress-lit", `${light}%`);
}

function applyProgress(progress) {
  const clamped = Math.max(0, Math.min(100, Number(progress) || 0));
  state.ritualProgress = clamped;
  progressFill.style.width = `${clamped}%`;
  progressText.textContent = clamped >= 100 ? "CEREMONY" : `PHASE ${Math.round(clamped)}`;
  updateColorPalette(clamped);
  refreshFlowHighlights(clamped);
}

function setSurgeCharge(value) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  state.surgeCharge = pct;
  surgeGauge.style.width = `${pct}%`;
}

function setHoneyState(type, expireAt) {
  if (type) {
    honeyLabel.textContent = `${type.toUpperCase()} active`;
  } else {
    honeyLabel.textContent = "Honey idle";
  }
  state.honeyExpire = expireAt ? Number(expireAt) : 0;
  updateHoneyTimer();
}

function updateHoneyTimer() {
  if (!honeyTimer) return;
  const remaining = Math.max(0, state.honeyExpire - Math.floor(Date.now() / 1000));
  honeyTimer.textContent = formatTime(remaining);
}

function updateHUDFromPayload(payload) {
  if (!payload) return;
  if (payload.level !== undefined) hudLevelEl.textContent = payload.level;
  if (payload.xp !== undefined) {
    xpEl.textContent = payload.xp;
    xpProfileEl.textContent = payload.xp;
  }
  if (payload.rituals !== undefined) ritualsEl.textContent = payload.rituals;
  if (payload.bonds !== undefined) bondsEl.textContent = payload.bonds;
  if (payload.watchers !== undefined) watchersEl.textContent = payload.watchers;
  if (payload.pentacles !== undefined) pentaclesEl.textContent = Number(payload.pentacles).toFixed(2);
  if (payload.ritual_progress !== undefined) applyProgress(payload.ritual_progress);
  if (payload.surge_charge !== undefined) setSurgeCharge(payload.surge_charge);
  else if (payload.surge_ready !== undefined) setSurgeCharge(payload.surge_ready ? 100 : 0);
  if (payload.honey !== undefined || payload.honey_expire !== undefined) {
    setHoneyState(payload.honey, payload.honey_expire || state.honeyExpire);
  }
}

function updateProfile(event) {
  const payload = event.payload || {};
  updateHUDFromPayload(payload);
  const type = event.type || payload.type || "unknown";
  const actor = legend(type);
  const xpValue = payload.xp;
  xpEl.textContent = xpValue ?? xpEl.textContent;
  ascensionEl.textContent = ascensionLevel;
  whisperEl.textContent = `Latest: ${actor}`;
}

function addFeed({ message, theme = themes.gossip }) {
  if (!feedEl || !message) return;
  const p = document.createElement("p");
  const chip = document.createElement("span");
  chip.className = `theme-chip ${theme.colorClass}`;
  chip.textContent = theme.label;
  p.appendChild(chip);
  p.append(" " + message);
  if (Math.random() > 0.95) {
    p.classList.add("glitch");
  }
  feedEl.prepend(p);
  if (feedEl.children.length > 12) {
    feedEl.removeChild(feedEl.lastChild);
  }
}

function addGossip(message, theme = themes.gossip) {
  addFeed({ message, theme });
}

function addActionFeedback(message, success = true) {
  addGossip(`▵ ${message}`, success ? themes.matrix : themes.gossip);
}

function viewPanel(view) {
  ["feed", "profile", "zones", "flow"].forEach((section) => {
    const el = document.getElementById(`${section}View`);
    if (!el) return;
    el.classList.toggle("hidden", section !== view);
  });
  document.querySelectorAll(".nav-links button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

document.querySelectorAll(".nav-links button").forEach((btn) => {
  btn.addEventListener("click", () => viewPanel(btn.dataset.view));
});

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playAura() {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 340;
  gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.8);
}

if (activationEl) {
  const triggerUnlock = (event) => {
    if (event) event.preventDefault();
    playAura();
    unlockExperience();
  };
  activationEl.addEventListener("click", triggerUnlock);
  activationEl.addEventListener("touchstart", triggerUnlock);
}

function unlockExperience() {
  if (unlocked || !activationEl) return;
  unlocked = true;
  activationEl.classList.add("hidden");
  document.body.classList.add("unlocked");
  addGossip("The gate shimmers open—symbols bloom across the relay.", themes.occult);
  setTimeout(() => reveal(), 400);
}

function reveal() {
  revealEl.style.opacity = 1;
  setTimeout(() => (revealEl.style.opacity = 0), 1100);
}

const overlayProfiles = {
  ritual_complete: {
    color: "#ff6b6b",
    message: (payload) => `Ritual pulse • +${payload?.xp ?? "—"} XP`,
  },
  surge: {
    color: "#4cffb9",
    message: () => "Surge ready • charge released",
  },
  surge_pending: {
    color: "#8ab4ff",
    message: (payload) =>
      `Surge primed • Await second signal (${Math.round((payload?.window_ms ?? 7000) / 1000)}s)`,
  },
  battle_result: {
    color: "#ffd166",
    message: (payload) => payload?.message || "Battle resolved",
  },
  honey_used: {
    color: "#f7b1ff",
    message: (payload) => `${payload?.type ?? "Honey"} consumed`,
  },
  artifact_spawn: {
    color: "#8aff8a",
    message: (payload) => `${payload?.artifact_id ?? "Artifact"} registered`,
  },
  ascension: {
    color: "#ff9d00",
    message: () => "Ascension sequence engaged",
  },
  flow_update: {
    color: "#5f7cff",
    message: (payload) =>
      `Flow ▵ Zone ${payload.zone || "0:0"} • Pressure ${payload.zone_pressure ?? 0}% • Jealousy ${
        payload.jealousy_level ?? 0
      }%`,
  },
  jealousy_alert: {
    color: "#ff6b6b",
    message: (payload) => `Jealousy ${payload?.jealousy_tag || "spike"} • Rivalry detected`,
  },
  default: {
    color: "#96d1ff",
    message: () => "Signal received",
  },
};

function triggerEventOverlay(type, payload) {
  const profile = overlayProfiles[type] || overlayProfiles.default;
  const overlay = document.createElement("div");
  overlay.className = "event-overlay";
  overlay.style.setProperty("--overlay-color", profile.color);
  overlay.innerHTML = `
    <span class="overlay-symbol">${legend(type)}</span>
    <p>${profile.message(payload)}</p>
  `;
  overlay.addEventListener("animationend", () => overlay.remove());
  overlayContainer.appendChild(overlay);
}

function triggerJealousyOverlay(payload) {
  if (!payload) return;
  const level = Number(payload.jealousy_level || 0);
  if (level >= 60) {
    triggerEventOverlay("jealousy_alert", payload);
  }
}

function themeFromEvent(event) {
  if (!event?.payload) return themes.gossip;
  const effect = String(event.payload.effect_type || event.payload.type || "").toLowerCase();
  if (effect.includes("ritual") || effect.includes("honey")) return themes.occult;
  if (effect.includes("xp") || effect.includes("surge")) return themes.exchange;
  if (effect.includes("artifact") || effect.includes("matrix")) return themes.matrix;
  return themes.gossip;
}

function connectRelay() {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "subscribe", channel: "events_channel" }));
    updateObserverHealthState("relay", true, "Socket live", "Subscribed to events_channel", "good");
    addGossip("Relay live — observer channel engaged", themes.matrix);
  });
  socket.addEventListener("message", (event) => {
    let parsed = null;
    let payload = {};
    try {
      parsed = JSON.parse(event.data);
      payload = parsed.payload || parsed;
      const type = parsed.type || payload?.type || "event";
      if (type === "connected" || type === "subscribed" || type === "pong" || type === "ack") {
        return;
      }
      const normalizedType =
        type === "feed" || type === "parcel_event"
          ? payload?.event_type || type
          : type;
      const normalizedPayload =
        type === "feed" || type === "parcel_event"
          ? payload?.payload || payload
          : payload;
      const theme = themeFromEvent({ payload: normalizedPayload });
      const messageText = trimMessage(
        payload?.message
          || `${normalizedType}${normalizedPayload?.artifact_id ? ` • ${normalizedPayload.artifact_id}` : ""}`,
        90
      );
      addFeed({ message: `▵ ${messageText}`, theme });
      recordFeedSignal(normalizedType, messageText);
      updateProfile({ type: normalizedType, payload: normalizedPayload });
      triggerEventOverlay(normalizedType, normalizedPayload);
      if (normalizedType === "flow_update") {
        triggerJealousyOverlay(normalizedPayload);
      }
    } catch {
      const raw = trimMessage(event.data, 90);
      addFeed({ message: `▵ raw • ${raw}`, theme: themes.gossip });
      recordFeedSignal("raw", raw);
    }
    const normalizedType =
      parsed?.type === "feed" || parsed?.type === "parcel_event"
        ? payload?.event_type
        : parsed?.type || payload?.type;
    if (normalizedType === "battle_result" || normalizedType === "session_ended" || normalizedType === "artifact_spawn") {
      fetchWorldSnapshot();
    }
    if (Math.random() > 0.95) {
      reveal();
    }
  });
  socket.addEventListener("close", () => {
    updateObserverHealthState("relay", false, "Reconnecting", "Socket dropped, retry in 3s", "warn");
    addGossip("Relay disconnected — reconnection pending", themes.gossip);
    setTimeout(connectRelay, 3000);
  });
  socket.addEventListener("error", () => {
    updateObserverHealthState("relay", false, "Socket error", "Check relay health or browser connection", "bad");
    addGossip("Relay error — check the matrix", themes.matrix);
  });
}

function isConnected() {
  return Boolean(state.avatar && state.token);
}

function updateConnectionCTA() {
  connectBtn.textContent = isConnected() ? "Identity anchored" : "Anchor Identity";
}

function connectIdentity() {
  const avatar = avatarInput.value.trim();
  const partner = partnerInput.value.trim();
  if (!avatar) {
    addGossip("Anchor your avatar to interact with the lodge.", themes.gossip);
    return;
  }
  if (!state.token) {
    addGossip("Observer mode is active. A private token is still required for ritual actions.", themes.gossip);
    return;
  }
  state.avatar = avatar;
  state.partner = partner;
  updateConnectionCTA();
  addGossip(`Identity anchored as ${avatar.slice(0, 6)}...`, themes.matrix);
}

async function sendAction(endpoint, payload = {}, message = "Action") {
  if (!isConnected()) {
    addFeed({ message: "Anchor identity first.", theme: themes.gossip });
    return null;
  }
  const body = {
    avatar: state.avatar,
    token: state.token,
    ...payload,
  };
  if (partnerInput?.value) {
    body.partner = partnerInput.value.trim();
  }
  try {
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const json = await resp.json().catch(() => ({}));
    addActionFeedback(`${message} queued`);
    return json;
  } catch (err) {
    addActionFeedback(`${message} failed (${err.message})`, false);
    return null;
  }
}

async function startRitual() {
  const result = await sendAction("/session/start", {}, "Start Ritual");
  if (result?.ok) {
    armTickCooldown();
  }
}

async function tickRitual() {
  const remaining = Math.max(0, nextTickAt - Date.now());
  if (remaining > 0) {
    addActionFeedback(`Tick locked • ${formatCountdown(remaining)}`, false);
    updateTickCTA();
    return;
  }
  const result = await sendAction("/session/tick", {}, "Tick Ritual");
  if (result?.ok || result?.queued) {
    armTickCooldown();
  }
}

async function endRitual() {
  const result = await sendAction("/session/end", {}, "End Ritual");
  if (result?.ok || result?.queued) {
    nextTickAt = 0;
    updateTickCTA();
  }
}

async function requestDrip() {
  await sendAction("/drip", {}, "Drip Request");
}

async function applyHoney() {
  const type = honeyTypeSelect.value;
  const result = await sendAction("/honey/use", { type }, "Honey Use");
  if (result?.honey) {
    setHoneyState(result.honey, result.honey_expire);
  }
}

function updateHoneyTicker() {
  updateHoneyTimer();
  renderObserverCards();
}

document.addEventListener("DOMContentLoaded", () => {
  renderObserverCards();
  refreshObserverHealth();
  connectRelay();
  viewPanel("feed");
  startBtn?.addEventListener("click", startRitual);
  tickBtn?.addEventListener("click", tickRitual);
  endBtn?.addEventListener("click", endRitual);
  dripBtn?.addEventListener("click", requestDrip);
  applyHoneyBtn?.addEventListener("click", applyHoney);
  connectBtn?.addEventListener("click", connectIdentity);
  setInterval(updateHoneyTicker, 1000);
  setInterval(updateTickCTA, 1000);
  updateTickCTA();
  addFeed({ message: "▵ System synced", theme: themes.matrix });
  fetchWorldSnapshot();
  setInterval(fetchWorldSnapshot, BATTLE_REFRESH_MS);
  setInterval(refreshObserverHealth, 15000);
});
