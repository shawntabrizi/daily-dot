import { describe, expect, it } from "vitest";

import { codeAnswer } from "./generate";
import { isCode, pegsLabel, scoreCode } from "./engine";

describe("scoreCode", () => {
  it.each([
    ["1234", "1234", 4, 0],
    ["4321", "1234", 0, 4],
    ["5678", "1234", 0, 0],
    ["1243", "1234", 2, 2],
    // A repeated guess digit earns at most what the answer holds.
    ["1111", "1234", 1, 0],
    ["2111", "1234", 0, 2],
    // A repeated answer digit can be found twice.
    ["1100", "0011", 0, 4],
    ["1010", "1100", 2, 2],
    ["2223", "3222", 2, 2],
  ])("%s against %s is %i in place, %i elsewhere", (guess, answer, exact, near) => {
    expect(scoreCode(guess, answer)).toEqual({ exact, near });
  });

  it("takes four digits only", () => {
    expect(isCode("0042")).toBe(true);
    expect(isCode("123")).toBe(false);
    expect(isCode("12345")).toBe(false);
    expect(isCode("12a4")).toBe(false);
    expect(() => scoreCode("123", "1234")).toThrow(RangeError);
  });

  it("says the pegs in words", () => {
    expect(pegsLabel({ exact: 2, near: 1 })).toBe("2 in place, 1 elsewhere");
    expect(pegsLabel({ exact: 0, near: 0 })).toBe("No digit in the code");
    expect(pegsLabel({ exact: 4, near: 0 })).toBe("Cracked");
  });
});

describe("codeAnswer v1", () => {
  it("is frozen: these days keep these codes on every device (D11)", () => {
    expect(codeAnswer(0, "v1")).toBe("2367");
    expect(codeAnswer(1, "v1")).toBe("7454");
    expect(codeAnswer(295, "v1")).toBe("5392");
    expect(codeAnswer(1000, "v1")).toBe("4822");
  });

  it("draws four digits, repeats allowed, every digit about as often", () => {
    const counts = new Array<number>(10).fill(0);
    let repeats = 0;
    for (let day = 0; day < 3650; day += 1) {
      const code = codeAnswer(day, "v1");
      expect(isCode(code)).toBe(true);
      for (const digit of code) counts[Number(digit)]! += 1;
      if (new Set(code).size < 4) repeats += 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(1300);
      expect(count).toBeLessThan(1620);
    }
    // About half of all codes repeat a digit (1 - 10*9*8*7 / 10^4 = 49.6%).
    expect(repeats).toBeGreaterThan(1600);
    expect(repeats).toBeLessThan(2000);
  });

  it("rejects an unknown version and a bad day", () => {
    expect(() => codeAnswer(0, "v2" as "v1")).toThrow(RangeError);
    expect(() => codeAnswer(-1, "v1")).toThrow(RangeError);
  });
});
