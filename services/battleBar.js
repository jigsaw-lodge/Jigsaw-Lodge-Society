"use strict";

const PLAYER_PREFIX = "jls:player:";
const SEGMENT_COUNT = 14;

const ORDER_META = {
  architect: {
    key: "architect",
    label: "Architect Order",
    glyph: "✺",
    accent: "#6cffd2",
    roar: "Pentacle tide",
  },
  eye: {
    key: "eye",
    label: "Eye Order",
    glyph: "⚛",
    accent: "#ffa5e3",
    roar: "Matrix pulse",
  },
  black_sun: {
    key: "black_sun",
    label: "Black Sun",
    glyph: "☥",
    accent: "#ff3df0",
    roar: "Velvet surge",
  },
  neutral: {
    key: "neutral",
    label: "Neutral Tide",
    glyph: "◇",
    accent: "#b6b7c4",
    roar: "Stillwater",
  },
};

function normalizeOrder(order) {
  if (!order) return "neutral";
  const key = String(order).toLowerCase();
  return ORDER_META[key] ? key : "neutral";
}

async function loadOrderLookup(redis, avatars = []) {
  if (!redis || avatars.length === 0) return {};

  const pipeline = redis.multi();
  const keys = [];
  for (const avatar of avatars) {
    if (!avatar) continue;
    const key = `${PLAYER_PREFIX}${avatar}`;
    keys.push(avatar);
    pipeline.hGet(key, "order");
  }

  const values = await pipeline.exec();
  const map = {};
  for (let i = 0; i < keys.length; i += 1) {
    const raw = Array.isArray(values[i]) ? values[i][1] : values[i];
    map[keys[i]] = normalizeOrder(raw);
  }
  return map;
}

function describeOrder(key) {
  const normal = normalizeOrder(key);
  return ORDER_META[normal] || ORDER_META.neutral;
}

function buildBarString(leftOrder, rightOrder, leftSegments, rightSegments) {
  const leftPadding = "▱".repeat(Math.max(0, SEGMENT_COUNT - leftSegments));
  const rightPadding = "▱".repeat(Math.max(0, SEGMENT_COUNT - rightSegments));
  const leftBlock = "▰".repeat(leftSegments) + leftPadding;
  const rightBlock = rightPadding + "▰".repeat(rightSegments);
  return `${leftOrder.glyph} ${leftBlock} ◇ ◈ ◇ ${rightBlock} ${rightOrder.glyph}`;
}

function buildTicker(left, right, leftPoints, rightPoints) {
  const leftLabel = left.label;
  const rightLabel = right.label;
  return `${leftLabel} ${leftPoints} vs ${rightLabel} ${rightPoints} · ${left.roar}`;
}

function buildLastSummary(lastBattle, orderLookup) {
  if (!lastBattle) return "Battle feed waiting for the next ritual push.";
  const winner = lastBattle.payload?.winner;
  const loser = lastBattle.payload?.loser;
  const winnerOrder = describeOrder(orderLookup[winner]);
  const loserOrder = describeOrder(orderLookup[loser]);
  return `Battle whisper · ${winnerOrder.label} ${winner} just shoved ${loserOrder.label} ${loser} toward the ledger.`;
}

function defaultBattleBar() {
  const leftOrder = describeOrder("architect");
  const rightOrder = describeOrder("black_sun");
  const leftSegments = Math.floor(SEGMENT_COUNT / 2);
  const rightSegments = SEGMENT_COUNT - leftSegments;

  return {
    left: { ...leftOrder, points: 0 },
    right: { ...rightOrder, points: 0 },
    progress: 50,
    unicode: buildBarString(leftOrder, rightOrder, leftSegments, rightSegments),
    ticker: "Orders gathering · battle ribbon waiting",
    summary: "Battle whisper quiet for now.",
  };
}

async function buildBattleBar(redis, events = []) {
  if (!redis || !Array.isArray(events)) return defaultBattleBar();

  const battles = events.filter((event) => event && event.type === "battle_result");
  if (!battles.length) return defaultBattleBar();

  const avatars = new Set();
  for (const battle of battles) {
    const winner = battle.payload?.winner;
    const loser = battle.payload?.loser;
    if (winner) avatars.add(winner);
    if (loser) avatars.add(loser);
  }

  const lookup = await loadOrderLookup(redis, Array.from(avatars));
  const momentum = Object.keys(ORDER_META).reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  for (const battle of battles) {
    const winner = battle.payload?.winner;
    const loser = battle.payload?.loser;
    const winnerOrder = normalizeOrder(lookup[winner]);
    const loserOrder = normalizeOrder(lookup[loser]);
    momentum[winnerOrder] += 4;
    momentum[loserOrder] += 1;
  }

  const sorted = Object.entries(momentum)
    .sort(([, aValue], [, bValue]) => bValue - aValue)
    .filter(([, value]) => value > 0);

  if (!sorted.length) return defaultBattleBar();

  const leftKey = sorted[0][0];
  const rightKey = sorted[1]?.[0] || (leftKey === "neutral" ? "architect" : "neutral");
  const leftPoints = Math.max(1, momentum[leftKey]);
  const rightPoints = Math.max(1, momentum[rightKey]);

  const totalPoints = leftPoints + rightPoints;
  const ratio = totalPoints ? leftPoints / totalPoints : 0.5;
  let leftSegments = Math.round(ratio * SEGMENT_COUNT);
  leftSegments = Math.max(1, Math.min(SEGMENT_COUNT - 1, leftSegments));
  const rightSegments = SEGMENT_COUNT - leftSegments;

  const leftOrder = describeOrder(leftKey);
  const rightOrder = describeOrder(rightKey);

  return {
    left: { ...leftOrder, points: leftPoints },
    right: { ...rightOrder, points: rightPoints },
    progress: Math.round(ratio * 100),
    unicode: buildBarString(leftOrder, rightOrder, leftSegments, rightSegments),
    ticker: buildTicker(leftOrder, rightOrder, leftPoints, rightPoints),
    summary: buildLastSummary(battles[0], lookup),
  };
}

module.exports = {
  ORDER_META,
  defaultBattleBar,
  buildBattleBar,
};
