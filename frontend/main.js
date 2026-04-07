const body = document.body;
const baseUrl = body.dataset.baseUrl || "/api";
const wsUrl =
  body.dataset.wsUrl ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/`;

const feedEl = document.getElementById("feed");
const whisperEl = document.getElementById("whisper");
const xpEl = document.getElementById("xp");
const ascensionEl = document.getElementById("ascension");
const revealEl = document.getElementById("reveal");
const activationEl = document.getElementById("activation");

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

function legend(type) {
  const pool = archetypes[type] || archetypes.unknown;
  return pool[Math.floor(Math.random() * pool.length)];
}

function updateProfile(event) {
  const type = event.type || "unknown";
  const actor = legend(type);
  xpEl.textContent = event.payload?.xp ?? "—";
  ascensionEl.textContent = ascensionLevel;
  whisperEl.textContent = `Latest: ${actor}`;
}

function reveal() {
  revealEl.style.opacity = 1;
  setTimeout(() => (revealEl.style.opacity = 0), 1100);
}

let unlocked = false;

function unlockExperience() {
  if (unlocked || !activationEl) return;
  unlocked = true;
  activationEl.classList.add("hidden");
  document.body.classList.add("unlocked");
  addGossip("The gate shimmers open—symbols bloom across the relay.", themes.occult);
  setTimeout(() => reveal(), 400);
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
  ["feed", "profile", "zones"].forEach((section) => {
    const el = document.getElementById(`${section}View`);
    if (el) {
      el.classList.toggle("hidden", section !== view);
    }
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

function startZonesLoop() {
  updateZones();
  setInterval(updateZones, 4000);
}

function themeFromEvent(event) {
  if (!event?.payload) {
    return themes.gossip;
  }
  const effect = String(event.payload.effect_type || event.payload.type || "").toLowerCase();
  if (effect.includes("ritual") || effect.includes("honey")) {
    return themes.occult;
  }
  if (effect.includes("xp") || effect.includes("surge")) {
    return themes.exchange;
  }
  if (effect.includes("artifact") || effect.includes("matrix")) {
    return themes.matrix;
  }
  return themes.gossip;
}

function connectRelay() {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener("open", () => {
    addGossip("Relay live — gossip circuits engaged", themes.matrix);
  });
  socket.addEventListener("message", (event) => {
    let data = event.data;
    try {
      const parsed = JSON.parse(event.data);
      const payload = parsed.payload || parsed;
      const hint = parsed.type || payload?.type || "event";
      const theme = themeFromEvent(parsed);
      const body = `▵ ${hint} • ${payload?.artifact_id || payload?.event_type || ""}`.trim();
      addFeed({ message: body, theme });
      updateProfile(parsed);
    } catch {
      addFeed({ message: `▵ raw: ${data}`, theme: themes.gossip });
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

document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  connectRelay();
  startZonesLoop();
  addFeed({ message: "▵ System synced", theme: themes.matrix });
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
