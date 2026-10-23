import { describe, expect, it } from "vitest";

import {
  directionTo,
  haversineDistanceKm,
  proximityRamp,
} from "./geography";

const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 };
const SYDNEY = { lat: -33.8688, lng: 151.2093 };

describe("Globe geography", () => {
  it.each([
    ["London–Paris", LONDON, PARIS, 344],
    ["London–Sydney", LONDON, SYDNEY, 16_990],
  ])("keeps %s great-circle distance within 1%%", (_name, from, to, expected) => {
    expect(haversineDistanceKm(from, to)).toBeGreaterThan(expected * 0.99);
    expect(haversineDistanceKm(from, to)).toBeLessThan(expected * 1.01);
  });

  it("points from London toward Paris", () => {
    const direction = directionTo(LONDON, PARIS);
    expect(direction.label).toBe("south-east");
    expect(direction.arrow).toBe("↘");
    expect(direction.bearing).toBeGreaterThan(135);
    expect(direction.bearing).toBeLessThan(160);
  });

  it("uses only the two token-mixing ramp segments", () => {
    expect(proximityRamp(0)).toEqual({ segment: "near", mix: 100 });
    expect(proximityRamp(20_100)).toEqual({ segment: "far", mix: 0 });
  });
});
