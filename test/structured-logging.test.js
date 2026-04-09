"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEventLogContext,
  buildRequestLogContext,
  serializeError,
} = require("../services/structuredLogging");

test("buildRequestLogContext keeps useful request fields without exposing auth secrets", () => {
  const ctx = buildRequestLogContext(
    {
      method: "POST",
      originalUrl: "/api/admin/artifact/spawn",
      headers: {
        "x-admin-token": "supersecret-token",
        "x-jls-signature": "signed-proof",
        "x-forwarded-for": "198.51.100.10, 203.0.113.44",
        "x-jls-request-id": "req-header-001",
      },
      params: { artifactId: "artifact-42" },
      query: { limit: "25", active: "true" },
    },
    {
      avatar: "00000000-0000-4000-8000-000000000042",
      artifact_id: "artifact-42",
      token: "shared-token",
      signature: "signed-proof",
      admin_token: "supersecret-token",
      request_id: "req-body-001",
      zone: "ritual-lane",
      type: "sigil",
    },
    { outcome: "queued" }
  );

  assert.equal(ctx.route, "/api/admin/artifact/spawn");
  assert.equal(ctx.method, "POST");
  assert.equal(ctx.auth_mode, "signed");
  assert.equal(ctx.admin_auth_source, "header");
  assert.equal(ctx.source_ip, "198.51.100.10");
  assert.equal(ctx.avatar, "00000000-0000-4000-8000-000000000042");
  assert.equal(ctx.artifact_id, "artifact-42");
  assert.equal(ctx.request_id, "req-body-001");
  assert.equal(ctx.honey_type, "sigil");
  assert.equal(ctx.outcome, "queued");
  assert.equal("token" in ctx, false);
  assert.equal("signature" in ctx, false);
  assert.equal("admin_token" in ctx, false);
});

test("buildEventLogContext keeps audit fields without copying sensitive payload data", () => {
  const ctx = buildEventLogContext(
    {
      id: "evt-123",
      type: "artifact_spawn",
      payload: {
        artifact_id: "artifact-9",
        type: "sigil",
        zone: "artifact-lane",
        amount: 3,
        duration: 60000,
        token: "shared-token",
        signature: "signed-proof",
      },
      meta: {
        source: "admin",
        route: "/api/admin/artifact/spawn",
        admin_auth_source: "header",
        triggered_by: "admin",
      },
    },
    { outcome: "registered" }
  );

  assert.equal(ctx.event_id, "evt-123");
  assert.equal(ctx.event_type, "artifact_spawn");
  assert.equal(ctx.source, "admin");
  assert.equal(ctx.source_route, "/api/admin/artifact/spawn");
  assert.equal(ctx.admin_auth_source, "header");
  assert.equal(ctx.artifact_id, "artifact-9");
  assert.equal(ctx.artifact_type, "sigil");
  assert.equal(ctx.zone, "artifact-lane");
  assert.equal(ctx.amount, 3);
  assert.equal(ctx.duration_ms, 60000);
  assert.equal(ctx.triggered_by, "admin");
  assert.equal(ctx.outcome, "registered");
  assert.equal("token" in ctx, false);
  assert.equal("signature" in ctx, false);
});

test("serializeError keeps compact metadata and omits the stack", () => {
  const err = new Error("rate_limited");
  err.status = 429;
  err.code = "TOO_MANY_REQUESTS";

  const out = serializeError(err);

  assert.deepEqual(out, {
    name: "Error",
    message: "rate_limited",
    status: 429,
    code: "TOO_MANY_REQUESTS",
  });
  assert.equal("stack" in out, false);
});
