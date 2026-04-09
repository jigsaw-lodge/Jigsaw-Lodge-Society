"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "..", "scripts", "alert-report.py");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jls-alerts-"));
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

test("alert-report stays green when health, telemetry, and containers are healthy", () => {
  const dir = makeTempDir();
  const health = path.join(dir, "health.log");
  const telemetry = path.join(dir, "telemetry.log");
  const relayLog = path.join(dir, "relay.log");
  const dockerState = path.join(dir, "docker.json");
  const jsonOut = path.join(dir, "report.json");

  writeJsonLines(health, [
    { timestamp: "2026-04-09T00:00:00Z", label: "api", http_code: 200, ok: true, duration_ms: 40 },
    { timestamp: "2026-04-09T00:00:00Z", label: "worker", http_code: 200, ok: true, duration_ms: 25 },
    { timestamp: "2026-04-09T00:00:00Z", label: "wsrelay", http_code: 200, ok: true, duration_ms: 20 },
  ]);
  writeJsonLines(telemetry, [
    {
      timestamp: "2026-04-09T00:00:00Z",
      backend_latency: "0.120",
      backend_http_code: 200,
      backend_exit: 0,
      worker_latency: "0.050",
      worker_http_code: 200,
      worker_exit: 0,
      queue_depth: "2",
      event_subscribers: "2",
      relay_clients: 3,
      container_stats: [],
    },
  ]);
  fs.writeFileSync(relayLog, "", "utf8");
  fs.writeFileSync(
    dockerState,
    JSON.stringify([
      { Name: "/jls_backend", RestartCount: 0, State: { Status: "running", OOMKilled: false } },
      { Name: "/jls_worker", RestartCount: 0, State: { Status: "running", OOMKilled: false } },
      { Name: "/jls_relay", RestartCount: 0, State: { Status: "running", OOMKilled: false } },
    ]),
    "utf8"
  );

  const result = spawnSync("python3", [
    SCRIPT,
    "--health",
    health,
    "--telemetry",
    telemetry,
    "--relay-log",
    relayLog,
    "--docker-state",
    dockerState,
    "--json-out",
    jsonOut,
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(report.status, "ok");
  assert.equal(report.firing.length, 0);
});

test("alert-report fires when queue depth, relay disconnects, and container restarts cross thresholds", () => {
  const dir = makeTempDir();
  const health = path.join(dir, "health.log");
  const telemetry = path.join(dir, "telemetry.log");
  const relayLog = path.join(dir, "relay.log");
  const dockerState = path.join(dir, "docker.json");
  const jsonOut = path.join(dir, "report.json");

  writeJsonLines(health, [
    { timestamp: "2026-04-09T00:00:00Z", label: "api", http_code: 200, ok: true, duration_ms: 40 },
    { timestamp: "2026-04-09T00:00:00Z", label: "worker", http_code: 200, ok: true, duration_ms: 25 },
    { timestamp: "2026-04-09T00:00:00Z", label: "wsrelay", http_code: 200, ok: true, duration_ms: 20 },
  ]);
  writeJsonLines(telemetry, [
    {
      timestamp: "2026-04-09T00:00:00Z",
      backend_latency: "0.120",
      backend_http_code: 200,
      backend_exit: 0,
      worker_latency: "0.050",
      worker_http_code: 200,
      worker_exit: 0,
      queue_depth: "120",
      event_subscribers: "1",
      relay_clients: 0,
      container_stats: [],
    },
  ]);
  fs.writeFileSync(relayLog, "websocket client disconnected\n".repeat(25), "utf8");
  fs.writeFileSync(
    dockerState,
    JSON.stringify([
      { Name: "/jls_backend", RestartCount: 0, State: { Status: "running", OOMKilled: false } },
      { Name: "/jls_worker", RestartCount: 2, State: { Status: "running", OOMKilled: false } },
      { Name: "/jls_relay", RestartCount: 0, State: { Status: "running", OOMKilled: false } },
    ]),
    "utf8"
  );

  const result = spawnSync("python3", [
    SCRIPT,
    "--health",
    health,
    "--telemetry",
    telemetry,
    "--relay-log",
    relayLog,
    "--docker-state",
    dockerState,
    "--json-out",
    jsonOut,
  ], { encoding: "utf8" });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(report.status, "alert");
  const firingCodes = new Set(report.firing.map((row) => row.code));
  assert.equal(firingCodes.has("event_subscribers_low"), true);
  assert.equal(firingCodes.has("relay_disconnect_spike"), true);
  assert.equal(firingCodes.has("container_restart_detected"), true);
});
