"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { totalXpToReachLevel, xpToNextLevel, levelFromTotalXp } = require("../services/xpCurve");

test("xp curve: monotonic thresholds and sane L100 total", () => {
  let prev = 0;
  for (let level = 1; level <= 120; level += 1) {
    const next = totalXpToReachLevel(level);
    assert.ok(next > prev, `threshold should increase at level ${level}`);
    prev = next;
  }

  // Target is "~1.5M" (decision doc). Keep this a tolerance check so minor tuning
  // doesn't require code changes.
  const total100 = totalXpToReachLevel(100);
  assert.ok(total100 >= 1_200_000 && total100 <= 2_000_000, `L100 total xp out of range: ${total100}`);
});

test("xp curve: levelFromTotalXp matches exact thresholds", () => {
  for (let level = 0; level <= 80; level += 1) {
    const threshold = totalXpToReachLevel(level);
    assert.equal(levelFromTotalXp(threshold), level, `xp=${threshold} should map to level ${level}`);
    if (level < 80) {
      assert.equal(levelFromTotalXp(threshold + xpToNextLevel(level + 1) - 1), level);
    }
  }
});

