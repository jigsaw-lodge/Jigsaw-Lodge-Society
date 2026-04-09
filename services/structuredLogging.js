"use strict";

function compactString(value, options = {}) {
  if (value === undefined || value === null) return undefined;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 160;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max) : text;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function pickDefined(source) {
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return compactString(value[0]);
  return compactString(value);
}

function detectAuthMode(req, body = {}) {
  if (firstHeaderValue(req?.headers?.["x-jls-signature"]) || compactString(body.signature)) {
    return "signed";
  }
  if (firstHeaderValue(req?.headers?.["x-jls-token"]) || compactString(body.token)) {
    return "token";
  }
  return "open";
}

function detectAdminAuthSource(req, body = {}) {
  if (firstHeaderValue(req?.headers?.["x-admin-token"])) return "header";
  const auth = compactString(req?.headers?.authorization);
  if (auth && auth.toLowerCase().startsWith("bearer ")) return "bearer";
  if (compactString(body.admin_token)) return "body";
  return undefined;
}

function sourceIp(req) {
  const forwarded = firstHeaderValue(req?.headers?.["x-forwarded-for"]);
  if (forwarded) {
    return compactString(String(forwarded).split(",")[0].trim());
  }
  return compactString(req?.ip || req?.socket?.remoteAddress || "");
}

function buildRequestLogContext(req, body = {}, extra = {}) {
  const normalizedBody = body && typeof body === "object" ? body : {};
  const params = req?.params || {};
  const query = req?.query || {};

  return pickDefined({
    route: compactString(req?.originalUrl || req?.path || req?.url),
    method: compactString(req?.method),
    auth_mode: detectAuthMode(req, normalizedBody),
    admin_auth_source: detectAdminAuthSource(req, normalizedBody),
    source_ip: sourceIp(req),
    avatar: compactString(normalizedBody.avatar || normalizedBody.id),
    partner: compactString(normalizedBody.partner || normalizedBody.partner_avatar),
    winner: compactString(normalizedBody.winner),
    loser: compactString(normalizedBody.loser),
    session_id: compactString(normalizedBody.session_id || normalizedBody.pair_key || params.sessionId),
    object_id: compactString(normalizedBody.object_id || normalizedBody.object || normalizedBody.chair),
    artifact_id: compactString(normalizedBody.artifact_id || params.artifactId || params.id),
    zone: compactString(normalizedBody.zone || normalizedBody.location || query.zone),
    order: compactString(normalizedBody.order),
    action: compactString(normalizedBody.action),
    honey_type: compactString(normalizedBody.honey || normalizedBody.type),
    artifact_type: compactString(normalizedBody.artifact_type || normalizedBody.type),
    tier: compactString(normalizedBody.tier),
    request_id: compactString(
      normalizedBody.request_id
      || normalizedBody.nonce
      || req?.headers?.["x-jls-request-id"]
    ),
    amount: numeric(normalizedBody.amount),
    duration: numeric(normalizedBody.duration),
    delta_ms: numeric(normalizedBody.delta_ms ?? normalizedBody.deltaMs),
    limit: numeric(query.limit),
    active_filter: compactString(query.active),
    ...pickDefined(extra),
  });
}

function buildEventLogContext(event = {}, extra = {}) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const meta = event?.meta && typeof event.meta === "object" ? event.meta : {};

  return pickDefined({
    event_id: compactString(event?.id),
    event_type: compactString(event?.type),
    source: compactString(meta.source),
    source_route: compactString(meta.route || meta.source_route),
    admin_auth_source: compactString(meta.admin_auth_source),
    avatar: compactString(payload.avatar),
    partner: compactString(payload.partner),
    avatar_a: compactString(payload.avatar_a),
    avatar_b: compactString(payload.avatar_b),
    winner: compactString(payload.winner),
    loser: compactString(payload.loser),
    session_id: compactString(payload.session_id || payload.pair_key),
    object_id: compactString(payload.object_id),
    artifact_id: compactString(payload.artifact_id || payload.id),
    zone: compactString(payload.zone || payload.location),
    order: compactString(payload.order),
    request_id: compactString(payload.request_id),
    action: compactString(payload.action),
    honey_type: compactString(payload.honey || payload.type),
    artifact_type: compactString(payload.artifact_type || payload.type),
    tier: compactString(payload.tier),
    amount: numeric(payload.amount),
    xp: numeric(payload.xp ?? payload.xp_awarded ?? payload.ritual_xp),
    duration_ms: numeric(payload.duration),
    watchers: numeric(payload.watchers),
    reason: compactString(payload.reason),
    triggered_by: meta.triggered_by ? "admin" : undefined,
    ...pickDefined(extra),
  });
}

function serializeError(err) {
  if (!err) return undefined;
  return pickDefined({
    name: compactString(err.name || "Error"),
    message: compactString(err.message, { max: 240 }),
    status: numeric(err.status),
    code: compactString(err.code),
  });
}

module.exports = {
  buildEventLogContext,
  buildRequestLogContext,
  compactString,
  detectAdminAuthSource,
  detectAuthMode,
  numeric,
  pickDefined,
  serializeError,
};
