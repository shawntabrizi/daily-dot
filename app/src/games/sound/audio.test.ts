import { describe, expect, it } from "vitest";

import { levelFor, PEAK_LEVEL } from "./audio";

const db = (ratio: number): number => 20 * Math.log10(ratio);

describe("levelFor", () => {
  it("plays low tones louder than high ones, so they sound alike", () => {
    let previous = Infinity;
    for (let hz = 110; hz <= 880; hz += 10) {
      const level = levelFor(hz);
      expect(level).toBeLessThan(previous);
      expect(level).toBeGreaterThan(0);
      previous = level;
    }
  });

  it("corrects about three quarters of the 40-phon contour: ~17 dB across the range", () => {
    expect(levelFor(110)).toBeCloseTo(PEAK_LEVEL, 6);
    const spread = db(levelFor(110) / levelFor(880));
    expect(spread).toBeGreaterThan(15);
    expect(spread).toBeLessThan(19);
    // Most of the difference sits low down, where the ear loses sensitivity fastest.
    expect(db(levelFor(110) / levelFor(220))).toBeGreaterThan(db(levelFor(440) / levelFor(880)));
  });

  it("never goes above the peak, leaving headroom for the harmonics", () => {
    for (const hz of [100, 110, 300, 880, 1000]) {
      expect(levelFor(hz)).toBeLessThanOrEqual(PEAK_LEVEL + 1e-9);
    }
  });
});
