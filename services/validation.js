"use strict";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ZONE_RE = /^[A-Za-z0-9:_-]{1,64}$/;
const SAFE_TEXT_RE = /^[A-Za-z0-9:_\-./]{1,128}$/;
const ACTION_RE = /^[a-z0-9_:-]{1,64}$/;

function sanitizeAvatar(value) {
    const avatar = String(value || "").trim();
    return UUID_RE.test(avatar) ? avatar.toLowerCase() : "";
}

function sanitizeZone(value) {
    const zone = String(value || "").trim();
    if (!zone) return "0:0";
    return ZONE_RE.test(zone) ? zone : "";
}

function sanitizeText(value, fallback = "") {
    const text = String(value || "").trim();
    if (!text) return fallback;
    return SAFE_TEXT_RE.test(text) ? text : fallback;
}

function sanitizeAction(value) {
    const action = String(value || "").trim().toLowerCase();
    return ACTION_RE.test(action) ? action : "";
}

module.exports = {
    sanitizeAvatar,
    sanitizeZone,
    sanitizeText,
    sanitizeAction,
};
