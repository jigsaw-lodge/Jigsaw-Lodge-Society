"use strict";

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_SECRET_DIRS = [
  "/run/secrets",
  path.join(ROOT_DIR, "secrets"),
];

const SECRET_FILE_NAMES = {
  ADMIN_TOKEN: "admin_token",
  JLS_SHARED_TOKEN: "jls_shared_token",
  JLS_SIGNING_SECRET: "jls_signing_secret",
  DB_PASS: "db_pass",
};

const PLACEHOLDER_VALUES = new Set([
  "changeme",
  "password",
  "replace-with-a-strong-secret",
  "supersecret",
  "supersecret123",
  "testtoken",
]);

const SERVICE_SPECS = {
  api: {
    label: "API",
    requiredSecrets: ["ADMIN_TOKEN"],
    numeric: [
      { name: "PORT", min: 1, max: 65535 },
      { name: "WS_PORT", min: 1, max: 65535 },
      { name: "WS_HEARTBEAT_MS", min: 1000 },
    ],
  },
  worker: {
    label: "engine worker",
    numeric: [
      { name: "ACTIVE_REWARD_MS", min: 1000 },
      { name: "SESSION_IDLE_TIMEOUT_MS", min: 1000 },
      { name: "SESSION_PHASE_15_MS", min: 1000 },
      { name: "SESSION_RITUAL_MS", min: 1000 },
      { name: "ARTIFACT_CACHE_TTL_MS", min: 1000 },
      { name: "ARTIFACT_PRUNE_INTERVAL_MS", min: 1000 },
    ],
  },
  relay: {
    label: "ws relay",
    numeric: [
      { name: "WS_PORT", min: 1, max: 65535 },
    ],
  },
  artifact_smoke: {
    label: "artifact smoke script",
    requiredSecrets: ["ADMIN_TOKEN"],
    numeric: [
      { name: "WS_TIMEOUT_MS", min: 1000 },
    ],
  },
};

let dotenvLoaded = false;

function clean(value) {
  return String(value || "").trim();
}

function truthy(value) {
  return /^(1|true|yes)$/i.test(clean(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function loadDotenvFile(env = process.env) {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  try {
    require("dotenv").config({ path: path.join(ROOT_DIR, ".env"), processEnv: env });
  } catch {}
}

function secretFileName(secretName) {
  return SECRET_FILE_NAMES[secretName] || secretName.toLowerCase();
}

function secretDirCandidates(env = process.env) {
  const explicitDir = clean(env.JLS_SECRET_DIR);
  if (explicitDir) {
    return [explicitDir];
  }
  return unique(DEFAULT_SECRET_DIRS);
}

function resolveSecretPath(secretName, env = process.env) {
  const explicitPath = clean(env[`${secretName}_FILE`]);
  if (explicitPath) {
    return { path: explicitPath, source: `${secretName}_FILE` };
  }

  const fileName = secretFileName(secretName);
  for (const dir of secretDirCandidates(env)) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return { path: candidate, source: dir };
    }
  }

  return { path: "", source: "" };
}

function readSecretValue(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/\r/g, "").trim();
    if (!raw) {
      return {
        ok: false,
        message: `${filePath} is empty.`,
      };
    }
    return {
      ok: true,
      value: raw,
    };
  } catch (err) {
    return {
      ok: false,
      message: `${filePath} could not be read (${err.code || err.message}).`,
    };
  }
}

function hydrateEnvFromSecretStore(secretNames = Object.keys(SECRET_FILE_NAMES), env = process.env) {
  loadDotenvFile(env);

  const loadedSecrets = [];
  const errors = [];

  for (const secretName of secretNames) {
    if (clean(env[secretName])) {
      loadedSecrets.push({ name: secretName, source: "env" });
      continue;
    }

    const { path: secretPath, source } = resolveSecretPath(secretName, env);
    if (!secretPath) continue;

    const result = readSecretValue(secretPath);
    if (!result.ok) {
      errors.push({
        code: "secret_file_unreadable",
        secret: secretName,
        path: secretPath,
        message: `${secretName} was expected from ${source}, but ${result.message}`,
      });
      continue;
    }

    env[secretName] = result.value;
    loadedSecrets.push({ name: secretName, source, path: secretPath });
  }

  return { loadedSecrets, errors };
}

function validateNumber(name, env, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = clean(env[name]);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return `${name} must be a number, but received "${raw}".`;
  }
  if (value < min || value > max) {
    return `${name} must stay between ${min} and ${max}, but received "${raw}".`;
  }
  return null;
}

function placeholderWarning(secretName, env) {
  const value = clean(env[secretName]).toLowerCase();
  if (!value || !PLACEHOLDER_VALUES.has(value)) return null;
  return `${secretName} is still using a placeholder-style value. Replace it before trusting this environment for real testing or launch work.`;
}

function quickFixHint() {
  return [
    "Quick fix options:",
    "  1. Copy .env.example to .env and fill in the real values.",
    "  2. Or create untracked files like secrets/admin_token and secrets/db_pass.",
    "  3. Or point ADMIN_TOKEN_FILE / DB_PASS_FILE / JLS_SIGNING_SECRET_FILE at your mounted secret paths.",
  ].join("\n");
}

function serviceSpec(serviceName) {
  return SERVICE_SPECS[serviceName] || {
    label: serviceName,
    requiredSecrets: [],
    numeric: [],
  };
}

function validateRuntimeConfig(serviceName, env = process.env) {
  const spec = serviceSpec(serviceName);
  const { loadedSecrets, errors: secretLoadErrors } = hydrateEnvFromSecretStore(undefined, env);
  const errors = [...secretLoadErrors];
  const warnings = [];

  for (const secretName of spec.requiredSecrets || []) {
    if (!clean(env[secretName])) {
      errors.push({
        code: "missing_secret",
        secret: secretName,
        message: `${spec.label} cannot start without ${secretName}. Set it in .env, export it in your shell, or create secrets/${secretFileName(secretName)}.`,
      });
    }
  }

  if (truthy(env.JLS_REQUIRE_SIGNED_REQUESTS) && !clean(env.JLS_SIGNING_SECRET)) {
    errors.push({
      code: "missing_signing_secret",
      secret: "JLS_SIGNING_SECRET",
      message: `${spec.label} has JLS_REQUIRE_SIGNED_REQUESTS=1 but no JLS_SIGNING_SECRET. Create secrets/${secretFileName("JLS_SIGNING_SECRET")} before turning signed requests on.`,
    });
  }

  const redisUrl = clean(env.REDIS_URL);
  if (redisUrl && !/^redis:\/\/|^rediss:\/\//i.test(redisUrl)) {
    errors.push({
      code: "invalid_redis_url",
      message: `REDIS_URL must start with redis:// or rediss://, but received "${redisUrl}".`,
    });
  }

  for (const numericField of spec.numeric || []) {
    const errorMessage = validateNumber(numericField.name, env, numericField);
    if (errorMessage) {
      errors.push({
        code: "invalid_number",
        field: numericField.name,
        message: errorMessage,
      });
    }
  }

  for (const secretName of Object.keys(SECRET_FILE_NAMES)) {
    const warning = placeholderWarning(secretName, env);
    if (warning) {
      warnings.push({
        code: "placeholder_secret",
        secret: secretName,
        message: warning,
      });
    }
  }

  return {
    serviceName,
    label: spec.label,
    loadedSecrets,
    errors,
    warnings,
  };
}

function formatRuntimeConfigReport(report) {
  if (!report.errors.length) return "";
  const lines = [`${report.label} startup blocked by configuration:`];
  for (const error of report.errors) {
    lines.push(`- ${error.message}`);
  }
  lines.push("");
  lines.push(quickFixHint());
  return lines.join("\n");
}

function initializeRuntimeConfig(serviceName, env = process.env) {
  const report = validateRuntimeConfig(serviceName, env);
  if (report.errors.length) {
    const error = new Error(formatRuntimeConfigReport(report));
    error.report = report;
    throw error;
  }
  return report;
}

function emitRuntimeWarnings(report, logger = console) {
  for (const warning of report.warnings || []) {
    if (typeof logger.warn === "function") {
      logger.warn(
        {
          event: "runtime_config_warning",
          code: warning.code,
          secret: warning.secret,
        },
        warning.message
      );
      continue;
    }
    logger.warn(warning.message);
  }
}

module.exports = {
  ROOT_DIR,
  SECRET_FILE_NAMES,
  loadDotenvFile,
  secretFileName,
  secretDirCandidates,
  resolveSecretPath,
  hydrateEnvFromSecretStore,
  validateRuntimeConfig,
  formatRuntimeConfigReport,
  initializeRuntimeConfig,
  emitRuntimeWarnings,
};
