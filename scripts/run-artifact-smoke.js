#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");

const REPLAY_DIR = path.resolve(process.env.SMOKE_REPLAY_DIR || "replay-dumps");
const SMOKE_CMD = process.env.SMOKE_CMD || "npm";
const SMOKE_ARGS = process.env.SMOKE_ARGS ? process.env.SMOKE_ARGS.split(" ") : ["run", "artifact-smoke"];

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    proc.on("error", reject);
    proc.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`process terminated by signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`command exited with code ${code}`));
    });
  });
}

async function captureReplayDump() {
  fs.mkdirSync(REPLAY_DIR, { recursive: true });
  await runCommand(process.execPath, [
    path.resolve(__dirname, "replay-event.js"),
    "--latest-type",
    "artifact_spawn",
    "--dump-dir",
    REPLAY_DIR,
    "--no-publish",
  ]);
}

async function main() {
  try {
    await runCommand(SMOKE_CMD, SMOKE_ARGS);
  } catch (err) {
    console.error("Artifact smoke failed:", err.message);
    try {
      await captureReplayDump();
    } catch (dumpErr) {
      console.error("Replay dump failed:", dumpErr.message);
    }
    process.exit(1);
  }
  console.log("Artifact smoke succeeded.");
}

main().catch((err) => {
  console.error("Unexpected failure:", err);
  process.exit(1);
});
