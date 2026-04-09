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

async function fetchWorldBattle() {
  try {
    const resp = await fetch(`${baseUrl}/world`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const payload = await resp.json().catch(() => ({}));
    renderBattleBar(payload?.world?.battle);
  } catch (err) {
    console.warn("battle refresh failed", err);
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

function updateZones() {
  const zonesEl = document.getElementById("zones");
  zonesEl.innerHTML = "";
  for (let i = 0; i < 32; i += 1) {
    const zone = document.createElement("div");
    zone.className = "zone";
    const roll = Math.random();
    if (roll > 0.85) zone.classList.add("enemy");
    else if (roll > 0.6) zone.classList.add("active");
    zonesEl.appendChild(zone);
  }
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
    addGossip("Relay live — gossip circuits engaged", themes.matrix);
  });
  socket.addEventListener("message", (event) => {
    let data = event.data;
    let parsed = null;
    let payload = null;
    try {
      parsed = JSON.parse(event.data);
      payload = parsed.payload || parsed;
      const hint = parsed.type || payload?.type || "event";
      const theme = themeFromEvent(parsed);
      const body = `▵ ${hint} • ${payload?.artifact_id || payload?.event_type || ""}`.trim();
      addFeed({ message: body, theme });
      updateProfile(parsed);
      triggerEventOverlay(parsed.type || payload?.type || "default", payload);
      if ((parsed.type || payload?.type) === "flow_update") {
        triggerJealousyOverlay(payload);
      }
    } catch {
      addFeed({ message: `▵ raw: ${data}`, theme: themes.gossip });
    }
    if ((parsed?.type || payload?.type) === "battle_result") {
      fetchWorldBattle();
    }
    if (Math.random() > 0.95) {
      reveal();
    }
  });
  socket.addEventListener("close", () => {
    addGossip("Relay disconnected — reconnection pending", themes.gossip);
    setTimeout(connectRelay, 3000);
  });
  socket.addEventListener("error", () => {
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
    addGossip("Backend token is missing; contact the ritual admin.", themes.gossip);
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

function startZonesLoop() {
  updateZones();
  setInterval(updateZones, 4000);
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

async function checkHealth() {
  try {
    const resp = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    const body = await resp.json().catch(() => ({}));
    addFeed({
      message: resp.ok
        ? `▵ API healthy (redis:${body.redis ?? "?"})`
        : `▵ API error ${resp.status}`,
      theme: resp.ok ? themes.exchange : themes.gossip,
    });
  } catch (err) {
    addFeed({
      message: `▵ API unreachable: ${err.message}`,
      theme: themes.gossip,
    });
  }
}

function updateHoneyTicker() {
  updateHoneyTimer();
}

document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  connectRelay();
  startZonesLoop();
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
  fetchWorldBattle();
  setInterval(fetchWorldBattle, BATTLE_REFRESH_MS);
  setInterval(() => {
    const gossip = [
      "Eyes wide shut circle whispering about the next ritual.",
      "Stocks spike in zone 17; watchers are talking.",
      "Matrix echo: someone saw the relay leak order 42.",
      "Gossip girl says your avatar's been invited to a private ritual.",
    ];
    const pick = gossip[Math.floor(Math.random() * gossip.length)];
    addGossip(pick);
  }, 6500);
});
