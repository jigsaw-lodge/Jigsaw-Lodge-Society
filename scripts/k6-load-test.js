import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "supersecret";
const AVATAR_COUNT = Number(__ENV.AVATAR_COUNT || 12000);
const STATEZONES = ["0:0", "1:1", "2:2", "3:3", "4:4", "5:5"];
const ACTIONS = ["event", "session_tick", "honey_used", "drip_request", "purchase"];

const avatars = Array.from({ length: AVATAR_COUNT }, (_, index) => buildAvatarId(index));
const MAX_VUS = 300;

export const options = {
  scenarios: {
    load: {
      executor: "constant-arrival-rate",
      rate: 250,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 150,
      maxVUs: 300,
      exec: "runTraffic",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<250"],
  },
};

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickAvatar() {
  const globalIndex = __ITER * MAX_VUS + (__VU - 1);
  const idx = globalIndex % avatars.length;
  return avatars[idx];
}

function buildAvatarId(index) {
  const suffix = index.toString(16).padStart(12, "0");
  const third = `4${((index >> 4) & 0xfff).toString(16).padStart(3, "0")}`;
  const variant = `${(8 + (index % 4)).toString(16)}000`;
  return `00000000-0000-${third}-${variant}-${suffix}`;
}

function buildEventBody(avatar) {
  return {
    avatar,
    action: randomFrom(ACTIONS),
    zone: randomFrom(STATEZONES),
    watchers: Math.floor(Math.random() * 10),
    token: "load-token",
  };
}

function buildSessionTickBody(avatar) {
  return {
    avatar,
    zone: randomFrom(STATEZONES),
    session_id: `load-session-${avatar}-${Math.floor(Math.random() * 10000)}`,
    ts: Math.floor(Date.now() / 1000),
    watchers: Math.floor(Math.random() * 5),
    token: "load-token",
  };
}

function buildArtifactPayload(avatar) {
  const now = Date.now();
  return {
    artifact_id: `load-artifact-${avatar}-${now}`,
    type: "load",
    power_level: Math.floor(Math.random() * 1000),
    effect_type: "xp_boost",
    location: randomFrom(STATEZONES),
    owner_id: avatar,
    duration: 60 * 60,
  };
}

export function runTraffic() {
  const avatar = pickAvatar();
  const headers = { "Content-Type": "application/json" };

  const eventRes = http.post(
    `${BASE_URL}/api/event`,
    JSON.stringify(buildEventBody(avatar)),
    { headers }
  );
  check(eventRes, {
    "event status 200": (r) => r.status === 200,
  });

  const tickRes = http.post(
    `${BASE_URL}/api/session/tick`,
    JSON.stringify(buildSessionTickBody(avatar)),
    { headers }
  );
  check(tickRes, {
    "tick status 200": (r) => r.status === 200,
  });

  if (__ITER % 5 === 0) {
    const adminHeaders = {
      "Content-Type": "application/json",
      "X-Admin-Token": ADMIN_TOKEN,
    };
    const artifactRes = http.post(
      `${BASE_URL}/api/admin/artifact/spawn`,
      JSON.stringify(buildArtifactPayload(avatar)),
      { headers: adminHeaders }
    );
    check(artifactRes, {
      "artifact status 200": (r) => r.status === 200,
    });
  }
}
