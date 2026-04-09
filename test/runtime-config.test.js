"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const {
  hydrateEnvFromSecretStore,
  secretFileName,
  validateRuntimeConfig,
} = require("../services/runtimeConfig");

const SERVER_ENTRY = path.resolve(__dirname, "..", "server.js");

function makeSecretDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jls-secrets-"));
}

function writeSecret(secretDir, secretName, value) {
  fs.writeFileSync(path.join(secretDir, secretFileName(secretName)), `${value}\n`, "utf8");
}

async function runEntry(entry, env) {
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ADMIN_TOKEN: "",
      JLS_SHARED_TOKEN: "",
      JLS_SIGNING_SECRET: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`entry did not exit in time\n${logs}`));
    }, 8000);

    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  return {
    exitCode: child.exitCode,
    logs,
  };
}

test("hydrateEnvFromSecretStore loads file-backed secrets into env", () => {
  const secretDir = makeSecretDir();
  writeSecret(secretDir, "ADMIN_TOKEN", "file-backed-admin");
  writeSecret(secretDir, "DB_PASS", "file-backed-db-pass");

  const env = {
    JLS_SECRET_DIR: secretDir,
    ADMIN_TOKEN: "",
    DB_PASS: "",
  };

  const report = hydrateEnvFromSecretStore(["ADMIN_TOKEN", "DB_PASS"], env);
  assert.equal(report.errors.length, 0);
  assert.equal(env.ADMIN_TOKEN, "file-backed-admin");
  assert.equal(env.DB_PASS, "file-backed-db-pass");
  assert.equal(report.loadedSecrets.length, 2);
});

test("validateRuntimeConfig reports missing startup secrets clearly", () => {
  const secretDir = makeSecretDir();

  const apiReport = validateRuntimeConfig("api", {
    JLS_SECRET_DIR: secretDir,
    ADMIN_TOKEN: "",
    PORT: "3000",
    WS_PORT: "3010",
  });
  assert.equal(apiReport.errors.some((item) => item.secret === "ADMIN_TOKEN"), true);

  const signedReport = validateRuntimeConfig("api", {
    JLS_SECRET_DIR: secretDir,
    ADMIN_TOKEN: "real-admin-token",
    JLS_REQUIRE_SIGNED_REQUESTS: "1",
    JLS_SIGNING_SECRET: "",
    PORT: "3000",
    WS_PORT: "3010",
  });
  assert.equal(signedReport.errors.some((item) => item.secret === "JLS_SIGNING_SECRET"), true);
});

test("server fails fast with a friendly error before touching Redis when ADMIN_TOKEN is missing", async () => {
  const secretDir = makeSecretDir();

  const result = await runEntry(SERVER_ENTRY, {
    HOST: "127.0.0.1",
    PORT: "3001",
    WS_PORT: "3011",
    REDIS_URL: "redis://127.0.0.1:6379",
    JLS_SECRET_DIR: secretDir,
    LOG_LEVEL: "error",
  });

  assert.equal(result.exitCode, 1, result.logs);
  assert.match(result.logs, /ADMIN_TOKEN/);
  assert.match(result.logs, /startup blocked by configuration/i);
  assert.doesNotMatch(result.logs, /redis error|startup failed|ECONNREFUSED/i);
});
