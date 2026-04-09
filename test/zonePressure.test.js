"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ZONE_PRESSURE_DECAY,
  ZONE_FLIP_THRESHOLD,
  deriveOrderMultiplier,
  calculateZonePressureDelta,
  nextZonePressureState,
} = require("../services/zonePressure");

test("zone pressure math matches the documented player exponent and order multipliers", () => {
  assert.equal(deriveOrderMultiplier("dominant"), 0.85);
  assert.equal(deriveOrderMultiplier("weak"), 1.25);
  assert.equal(deriveOrderMultiplier("architect"), 1);
  assert.equal(deriveOrderMultiplier("neutral"), 1);

  const neutral = calculateZonePressureDelta(2, 1);
  const weak = calculateZonePressureDelta(2, deriveOrderMultiplier("weak"));
  const dominant = calculateZonePressureDelta(2, deriveOrderMultiplier("dominant"));

  assert.ok(Math.abs(neutral - (Math.pow(2, 0.75) * 0.2)) < 1e-12);
  assert.ok(weak > neutral, "weak multiplier should raise pressure delta");
  assert.ok(dominant < neutral, "dominant multiplier should lower pressure delta");
});

test("zone pressure decays before adding delta and flips cleanly at threshold", () => {
  const stable = nextZonePressureState({
    pressure: 50,
    players: 2,
    orderMultiplier: 1,
    owner: "neutral",
    ownerHint: "architect",
    now: 12345,
  });

  assert.equal(stable.flipped, false);
  assert.equal(stable.owner, "neutral");
  assert.ok(
    Math.abs(stable.pressure - (50 * ZONE_PRESSURE_DECAY + calculateZonePressureDelta(2, 1))) < 1e-12
  );

  const flip = nextZonePressureState({
    pressure: 102,
    players: 2,
    orderMultiplier: 1,
    owner: "neutral",
    ownerHint: "architect",
    now: 67890,
  });

  assert.equal(flip.flipped, true);
  assert.equal(flip.owner, "architect");
  assert.equal(flip.pressure, 0);
  assert.equal(flip.last_flip, 67890);
  assert.ok(102 * ZONE_PRESSURE_DECAY + calculateZonePressureDelta(2, 1) >= ZONE_FLIP_THRESHOLD);
});
