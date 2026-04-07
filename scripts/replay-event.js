#!/usr/bin/env node
"use strict";

require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");
const { createClient } = require("redis");
const path = require("path");
const { EVENT_CHANNEL } = require("../services/eventDispatcher");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "jls",
};

function usage() {
  console.log(`Usage:
  node scripts/replay-event.js <event_id> [--channel <channel>] [--dump-dir <dir>] [--no-publish]
  node scripts/replay-event.js --file <path/to/event.json> [--channel <channel>] [--dump-dir <dir>] [--no-publish]
  node scripts/replay-event.js --latest-type <event_type> [--channel <channel>] [--dump-dir <dir>] [--no-publish]

Options:
  --channel <name>   Publish to an alternate Redis channel (default: ${EVENT_CHANNEL}).
  --file <path>      Skip the database lookup and publish the JSON payload at <path>.
  --latest-type <type>  Load the most recent event of <type> instead of specifying an ID.
  --dump-dir <path>  Write the raw event JSON to the provided directory (created if needed).
  --no-publish       Only dump the event JSON without publishing it to Redis.
`);
}

async function fetchEventFromDb(eventId) {
  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query(
      `SELECT id, type, payload, meta, contract_version, created_at
       FROM events
       WHERE id = $1
       LIMIT 1`,
      [eventId]
    );
    if (!rows.length) {
      throw new Error(`event ${eventId} not found`);
    }
    return rows[0];
  } finally {
    await pool.end();
  }
}


async function fetchLatestEventByType(type) {
  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query(
      `SELECT id, type, payload, meta, contract_version, created_at
       FROM events
       WHERE type = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [type]
    );
    if (!rows.length) {
      throw new Error(`no events of type ${type} found`);
    }
    return rows[0];
  } finally {
    await pool.end();
  }
}

function dumpEventToDir(event, dumpDir) {
  if (!dumpDir) return;
  const outDir = path.resolve(dumpDir);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = path.join(outDir, `${event.id || "event"}-${Date.now()}.json`);
  fs.writeFileSync(fileName, JSON.stringify(event, null, 2));
  console.log(`Dumped event to ${fileName}`);
  return fileName;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(args.length ? 0 : 1);
  }

  let eventId = null;
  let channel = EVENT_CHANNEL;
  let filePath = null;
  let dumpDir = null;
  let latestType = null;
  let publish = true;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--channel") {
      i += 1;
      if (!args[i]) throw new Error("--channel requires a value");
      channel = args[i];
      continue;
    }
    if (token === "--file") {
      i += 1;
      if (!args[i]) throw new Error("--file requires a path");
      filePath = args[i];
      continue;
    }
    if (token === "--dump-dir") {
      i += 1;
      if (!args[i]) throw new Error("--dump-dir requires a path");
      dumpDir = args[i];
      continue;
    }
    if (token === "--latest-type") {
      i += 1;
      if (!args[i]) throw new Error("--latest-type requires a value");
      latestType = args[i];
      continue;
    }
    if (token === "--no-publish") {
      publish = false;
      continue;
    }
    if (!eventId) {
      eventId = token;
      continue;
    }
    throw new Error(`unexpected argument: ${token}`);
  }

  if (!eventId && !filePath && !latestType) {
    throw new Error("missing event identifier or --file");
  }

  let event;
  if (filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    event = JSON.parse(raw);
  } else if (latestType) {
    event = await fetchLatestEventByType(latestType);
  } else {
    event = await fetchEventFromDb(eventId);
  }

  dumpEventToDir(event, dumpDir);

  const redis = createClient({ url: REDIS_URL });
  redis.on("error", (err) => {
    console.error("redis error", err);
    process.exit(1);
  });

  if (!publish) {
    console.log("Publish suppressed (--no-publish); exiting after dump.");
    return;
  }

  await redis.connect();
  await redis.publish(channel, JSON.stringify(event));
  console.log(`Published event ${event.id || eventId || "<unknown>"} to ${channel}`);
  await redis.quit();
}

main().catch((err) => {
  console.error("replay failed:", err.message);
  process.exit(1);
});
