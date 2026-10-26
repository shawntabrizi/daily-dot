import { describe, expect, it } from "vitest";

import {
  ciede2000,
  hsbToRgb,
  isHsb,
  roundScore,
  scoreForDelta,
  srgbToLab,
  totalScore,
  type Hsb,
} from "./engine";
import { colorAnswer, V1_BRIGHTNESS, V1_SATURATION } from "./generate";

/**
 * Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference formula:
 * implementation notes, supplementary test data, and mathematical
 * observations", Table 1: every pair, Lab 1, Lab 2, ΔE00.
 */
const SHARMA: [number, number, number, number, number, number, number][] = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
  [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -0.9009, -85.5211, 50.0, 0.0, -82.7485, 1.0],
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669],
  [50.0, -1.0, 2.0, 50.0, 0.0, 0.0, 2.3669],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.001, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0012, 7.2195],
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.001, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.0011, -2.49, 4.7461],
  [50.0, 2.5, 0.0, 50.0, 0.0, -2.5, 4.3065],
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492],
  [50.0, 2.5, 0.0, 61.0, -5.0, 29.0, 22.8977],
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903],
  [50.0, 2.5, 0.0, 58.0, 24.0, 15.0, 19.4535],
  [50.0, 2.5, 0.0, 50.0, 3.1736, 0.5854, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2972, 0.0, 1.0],
  [50.0, 2.5, 0.0, 50.0, 1.8634, 0.5757, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

describe("ciede2000", () => {
  it.each(SHARMA.map((row, index) => [index + 1, ...row] as const))(
    "Sharma pair %i",
    (_pair, L1, a1, b1, L2, a2, b2, expected) => {
      const first = { L: L1, a: a1, b: b1 };
      const second = { L: L2, a: a2, b: b2 };
      expect(ciede2000(first, second)).toBeCloseTo(expected, 4);
      // The formula is symmetric; Sharma lists pairs 7 and 8 to check it.
      expect(ciede2000(second, first)).toBeCloseTo(expected, 4);
    },
  );

  it("splits the 180° hue region on which side the mean falls (pairs 10 and 11)", () => {
    // Hue difference just under and just over 180°: the mean hue jumps by 180°,
    // and so does T. An implementation that averages hues naively gets one wrong.
    const left = { L: 50, a: 2.49, b: -0.001 };
    expect(ciede2000(left, { L: 50, a: -2.49, b: 0.001 })).toBeCloseTo(7.1792, 4);
    expect(ciede2000(left, { L: 50, a: -2.49, b: 0.0011 })).toBeCloseTo(7.2195, 4);
  });

  it("is zero for the same color", () => {
    expect(ciede2000({ L: 40, a: 12, b: -30 }, { L: 40, a: 12, b: -30 })).toBe(0);
  });
});

describe("srgbToLab (D65)", () => {
  it.each([
    [[255, 255, 255], 100, 0, 0],
    [[0, 0, 0], 0, 0, 0],
    [[255, 0, 0], 53.24, 80.09, 67.2],
    [[0, 255, 0], 87.73, -86.18, 83.18],
    [[0, 0, 255], 32.3, 79.19, -107.86],
    [[128, 128, 128], 53.59, 0, 0],
  ] as const)("%j", (rgb, L, a, b) => {
    const lab = srgbToLab(rgb);
    expect(lab.L).toBeCloseTo(L, 1);
    expect(lab.a).toBeCloseTo(a, 1);
    expect(lab.b).toBeCloseTo(b, 1);
  });
});

describe("hsbToRgb", () => {
  it.each([
    [{ hue: 0, saturation: 100, brightness: 100 }, [255, 0, 0]],
    [{ hue: 120, saturation: 100, brightness: 100 }, [0, 255, 0]],
    [{ hue: 240, saturation: 100, brightness: 50 }, [0, 0, 127.5]],
    [{ hue: 60, saturation: 50, brightness: 100 }, [255, 255, 127.5]],
    [{ hue: 210, saturation: 60, brightness: 80 }, [81.6, 142.8, 204]],
    [{ hue: 300, saturation: 100, brightness: 100 }, [255, 0, 255]],
    [{ hue: 359, saturation: 0, brightness: 40 }, [102, 102, 102]],
  ] as const)("%j", (hsb, rgb) => {
    const out = hsbToRgb(hsb);
    rgb.forEach((channel, index) => expect(out[index]).toBeCloseTo(channel, 6));
  });
});

describe("the score", () => {
  it("is 10 × max(0, 1 − ΔE00/40), in tenths, rounded to the nearest tenth", () => {
    expect(scoreForDelta(0)).toBe(100);
    expect(scoreForDelta(10)).toBe(75);
    expect(scoreForDelta(20)).toBe(50);
    expect(scoreForDelta(2.0425)).toBe(95); // 9.489 → 9.5
    expect(scoreForDelta(2.19)).toBe(95); // 9.4525 → 9.5
    expect(scoreForDelta(2.21)).toBe(94); // 9.4475 → 9.4
    expect(scoreForDelta(13.7)).toBe(66); // 6.575 → 6.6
    expect(scoreForDelta(39.9)).toBe(0); // 0.025 → 0.0
    expect(scoreForDelta(39.7)).toBe(1); // 0.075 → 0.1
  });

  it("clamps at zero from ΔE00 40 on, never negative", () => {
    expect(scoreForDelta(40)).toBe(0);
    expect(scoreForDelta(75)).toBe(0);
    expect(() => scoreForDelta(-1)).toThrow(RangeError);
    expect(() => scoreForDelta(Number.NaN)).toThrow(RangeError);
  });

  it("scores a color through sRGB and CIELAB, and the day as the sum of the rounded colors", () => {
    const target: Hsb = { hue: 210, saturation: 60, brightness: 80 };
    expect(roundScore(target, target)).toBe(100);
    // Opposite hues are far apart; black against white is beyond 40.
    expect(roundScore(target, { hue: 30, saturation: 60, brightness: 80 })).toBeLessThan(10);
    expect(roundScore({ hue: 0, saturation: 0, brightness: 0 }, { hue: 0, saturation: 0, brightness: 100 })).toBe(0);
    // Hue wraps: 359° and 1° are neighbors, not 358° apart.
    const red = { hue: 359, saturation: 90, brightness: 90 };
    expect(roundScore(red, { ...red, hue: 1 })).toBeGreaterThanOrEqual(95);

    const near = { hue: 214, saturation: 60, brightness: 80 };
    expect(totalScore([target, target], [target, near])).toBe(100 + roundScore(target, near));
    expect(() => roundScore(target, { hue: 360, saturation: 50, brightness: 50 })).toThrow(RangeError);
  });

  it("takes whole hue 0–359 and whole percents", () => {
    expect(isHsb({ hue: 0, saturation: 0, brightness: 0 })).toBe(true);
    expect(isHsb({ hue: 359, saturation: 100, brightness: 100 })).toBe(true);
    expect(isHsb({ hue: 360, saturation: 50, brightness: 50 })).toBe(false);
    expect(isHsb({ hue: 10, saturation: 50.5, brightness: 50 })).toBe(false);
    expect(isHsb({ hue: 10, saturation: 50 })).toBe(false);
  });
});

describe("colorAnswer v1", () => {
  it("is frozen: these days keep these colors on every device (D11)", () => {
    expect(colorAnswer(0, "v1")).toEqual(FROZEN_0);
    expect(colorAnswer(295, "v1")[0]).toEqual(FROZEN_295_FIRST);
    expect(colorAnswer(1000, "v1")[4]).toEqual(FROZEN_1000_LAST);
  });

  it("draws five colors a day within hue 0–359, saturation 25–100, brightness 30–100", () => {
    const seen = { hueLow: false, hueHigh: false, satLow: false, satHigh: false, briLow: false, briHigh: false };
    for (let day = 0; day < 3650; day += 1) {
      const colors = colorAnswer(day, "v1");
      expect(colors).toHaveLength(5);
      for (const { hue, saturation, brightness } of colors) {
        expect(isHsb({ hue, saturation, brightness })).toBe(true);
        expect(saturation).toBeGreaterThanOrEqual(V1_SATURATION.min);
        expect(saturation).toBeLessThanOrEqual(V1_SATURATION.max);
        expect(brightness).toBeGreaterThanOrEqual(V1_BRIGHTNESS.min);
        expect(brightness).toBeLessThanOrEqual(V1_BRIGHTNESS.max);
        seen.hueLow ||= hue === 0;
        seen.hueHigh ||= hue === 359;
        seen.satLow ||= saturation === 25;
        seen.satHigh ||= saturation === 100;
        seen.briLow ||= brightness === 30;
        seen.briHigh ||= brightness === 100;
      }
    }
    // Both ends of every range are reachable.
    expect(Object.values(seen).every(Boolean)).toBe(true);
    expect(colorAnswer(5, "v1")).not.toEqual(colorAnswer(6, "v1"));
  });
});

const FROZEN_0: Hsb[] = [
  { hue: 102, saturation: 86, brightness: 40 },
  { hue: 11, saturation: 45, brightness: 57 },
  { hue: 126, saturation: 48, brightness: 97 },
  { hue: 28, saturation: 28, brightness: 63 },
  { hue: 267, saturation: 69, brightness: 99 },
];
const FROZEN_295_FIRST: Hsb = { hue: 285, saturation: 65, brightness: 84 };
const FROZEN_1000_LAST: Hsb = { hue: 359, saturation: 93, brightness: 45 };
