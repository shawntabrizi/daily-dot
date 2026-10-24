import { describe, expect, it } from "vitest";

import {
  centsToHz,
  erbDelta,
  erbRate,
  formatHundredths,
  formatHz,
  hzToCents,
  isHz,
  MAX_CENTS,
  MAX_HZ,
  MIN_HZ,
  positionToCents,
  scoreForErb,
  toneScore,
  totalHundredths,
  totalScore,
  verdictFor,
} from "./engine";
import { soundAnswer } from "./generate";

describe("ERB-rate (Glasberg & Moore)", () => {
  it("is 21.4 · log10(1 + 0.00437 f)", () => {
    expect(erbRate(0)).toBe(0);
    expect(erbRate(1000)).toBeCloseTo(15.6214, 4);
    expect(erbRate(173.83)).toBeCloseTo(5.25205, 5);
    expect(erbRate(190.36)).toBeCloseTo(5.62596, 5);
    expect(() => erbRate(-1)).toThrow(RangeError);
  });

  it("measures a miss in ERB, the same either way", () => {
    expect(erbDelta(173.83, 190.36)).toBeCloseTo(0.3739, 4);
    expect(erbDelta(190.36, 173.83)).toBeCloseTo(0.3739, 4);
    // A semitone up weighs more ERB high than low: the scale is not plain log pitch.
    expect(erbDelta(110, centsToHz(100))).toBeLessThan(erbDelta(440, centsToHz(2500)));
  });
});

describe("the tone score", () => {
  it("is 10 × max(0, 1 − ΔERB/0.5), to hundredths: 173.83 vs 190.36 Hz scores 2.52", () => {
    expect(toneScore(173.83, 190.36)).toBe(252);
    expect(formatHundredths(toneScore(173.83, 190.36))).toBe("2.52");
    expect(scoreForErb(0.25)).toBeCloseTo(5, 10);
    expect(scoreForErb(0.1)).toBeCloseTo(8, 10);
  });

  it("gives an exact match 10.00 and clamps at zero from 0.5 ERB on", () => {
    expect(toneScore(440, 440)).toBe(1000);
    expect(scoreForErb(0)).toBe(10);
    expect(scoreForErb(0.5)).toBe(0);
    expect(scoreForErb(3)).toBe(0);
    expect(toneScore(110, 880)).toBe(0);
    expect(() => scoreForErb(-0.1)).toThrow(RangeError);
  });

  it("takes only 110–880 Hz to the hundredth", () => {
    expect(isHz(110)).toBe(true);
    expect(isHz(880)).toBe(true);
    expect(isHz(220.13)).toBe(true);
    expect(isHz(109.99)).toBe(false);
    expect(isHz(880.01)).toBe(false);
    expect(isHz(220.135)).toBe(false);
    expect(() => toneScore(100, 200)).toThrow(RangeError);
  });

  it("records the day in tenths: the shown hundredths summed, then rounded half up", () => {
    // 2.52 + 10.00 + 0 = 12.52 → 12.5 points; one more 2.52 makes 15.04 → 15.0.
    expect(totalHundredths([173.83, 440, 110], [190.36, 440, 880])).toBe(1252);
    expect(totalScore([173.83, 440, 110], [190.36, 440, 880])).toBe(125);
    expect(totalScore([173.83, 173.83], [190.36, 190.36])).toBe(50);
    // 2.52 × 4 + 10.00 = 20.08 → 20.1.
    expect(totalScore([173.83, 173.83, 173.83, 173.83, 440], [190.36, 190.36, 190.36, 190.36, 440])).toBe(201);
    // A 5 in the hundredths rounds up, not to even.
    let half = 441;
    while (toneScore(440, half) % 10 !== 5) half = Math.round((half + 0.01) * 100) / 100;
    expect(totalScore([440], [half])).toBe((toneScore(440, half) + 5) / 10);
    expect(totalScore([440, 440, 440, 440, 440], [440, 440, 440, 440, 440])).toBe(500);
    expect(totalScore([], [])).toBe(0);
  });

  it("puts a verdict under the score", () => {
    expect(verdictFor(1000)).toBe("Perfect pitch.");
    expect(verdictFor(252)).toBe("A way off.");
    expect(verdictFor(0)).toBe("Not this time.");
  });
});

describe("the pitch control", () => {
  it("is whole cents over three octaves, shown in Hz to the hundredth", () => {
    expect(MAX_CENTS).toBe(3600);
    expect(centsToHz(0)).toBe(110);
    expect(centsToHz(1200)).toBe(220);
    expect(centsToHz(1800)).toBe(311.13);
    expect(centsToHz(3600)).toBe(880);
    // One cent above 220 Hz, and fifty.
    expect(centsToHz(1201)).toBe(220.13);
    expect(centsToHz(1250)).toBe(226.45);
    expect(centsToHz(-40)).toBe(110);
    expect(centsToHz(4000)).toBe(880);
    expect(hzToCents(440)).toBe(2400);
    expect(hzToCents(1000)).toBe(3600);
    expect(formatHz(220)).toBe("220.00 Hz");
  });

  it("maps the board's height to log pitch: top 880 Hz, bottom 110 Hz, an octave a third", () => {
    expect(centsToHz(positionToCents(0))).toBe(MAX_HZ);
    expect(centsToHz(positionToCents(1))).toBe(MIN_HZ);
    expect(centsToHz(positionToCents(1 / 3))).toBe(440);
    expect(centsToHz(positionToCents(2 / 3))).toBe(220);
    expect(centsToHz(positionToCents(0.5))).toBe(311.13);
    expect(positionToCents(-0.2)).toBe(3600);
    expect(positionToCents(1.4)).toBe(0);
  });
});

describe("soundAnswer v1", () => {
  it("is frozen: these days keep these tones on every device (D11)", () => {
    expect(soundAnswer(0, "v1")).toEqual([234.36, 137.04, 428.29, 235.21, 510.3]);
    expect(soundAnswer(208, "v1")).toEqual([416.48, 137.2, 126.14, 126.4, 778.43]);
    expect(soundAnswer(295, "v1")[0]).toBe(495.27);
    expect(soundAnswer(1000, "v1")[4]).toBe(130.69);
  });

  it("draws five tones a day within 110–880 Hz, to the hundredth, spread over the octaves", () => {
    const octaves = [0, 0, 0];
    for (let day = 0; day < 2000; day += 1) {
      const tones = soundAnswer(day, "v1");
      expect(tones).toHaveLength(5);
      for (const hz of tones) {
        expect(isHz(hz)).toBe(true);
        octaves[Math.min(2, Math.floor(Math.log2(hz / MIN_HZ)))]! += 1;
      }
    }
    // Log-uniform: each octave gets about a third of the 10,000 tones.
    for (const count of octaves) {
      expect(count).toBeGreaterThan(3000);
      expect(count).toBeLessThan(3700);
    }
    expect(soundAnswer(5, "v1")).not.toEqual(soundAnswer(6, "v1"));
    expect(() => soundAnswer(5, "v2" as "v1")).toThrow(RangeError);
  });
});
