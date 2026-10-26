import { describe, expect, it } from "vitest";

import { angleAnswer } from "./generate";
import { hintFor, isAngle } from "./engine";

describe("hintFor", () => {
  it.each([
    [137, 137, "exact", null],
    [136, 137, "burning", "up"],
    [134, 137, "burning", "up"],
    [133, 137, "hot", "up"],
    [147, 137, "hot", "down"],
    [148, 137, "warm", "down"],
    [162, 137, "warm", "down"],
    [163, 137, "cold", "down"],
    // Shawn's case: 14° off is not near enough to be Hot.
    [29, 43, "warm", "up"],
    [90, 137, "cold", "up"],
  ])("%i° for %i° is %s, %s", (guess, answer, heat, direction) => {
    expect(hintFor(guess, answer)).toEqual({ heat, direction });
  });

  it("measures along 1–359, not around the circle", () => {
    expect(hintFor(358, 2)).toEqual({ heat: "cold", direction: "down" });
  });

  it("takes whole degrees from 1 to 359", () => {
    expect(isAngle(1)).toBe(true);
    expect(isAngle(359)).toBe(true);
    expect(isAngle(0)).toBe(false);
    expect(isAngle(360)).toBe(false);
    expect(isAngle(45.5)).toBe(false);
    expect(() => hintFor(0, 10)).toThrow(RangeError);
  });
});

describe("angleAnswer v1", () => {
  it("is frozen: these days keep these angles on every device (D11)", () => {
    expect(angleAnswer(0, "v1")).toEqual({ degrees: 34, rotation: 149 });
    expect(angleAnswer(1, "v1")).toEqual({ degrees: 87, rotation: 132 });
    expect(angleAnswer(295, "v1")).toEqual({ degrees: 93, rotation: 109 });
    expect(angleAnswer(1000, "v1")).toEqual({ degrees: 356, rotation: 331 });
  });

  it("draws 1°–359°, about half of them reflex", () => {
    let reflex = 0;
    for (let day = 0; day < 3650; day += 1) {
      const { degrees, rotation } = angleAnswer(day, "v1");
      expect(isAngle(degrees)).toBe(true);
      expect(rotation).toBeGreaterThanOrEqual(0);
      expect(rotation).toBeLessThan(360);
      if (degrees > 180) reflex += 1;
    }
    expect(reflex).toBeGreaterThan(1650);
    expect(reflex).toBeLessThan(2000);
  });
});
