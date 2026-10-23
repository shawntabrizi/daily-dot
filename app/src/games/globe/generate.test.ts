import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import fixtures from "./fixtures/v1.json";
import {
  GLOBE_COUNTRIES,
  globeAnswer,
} from "./generate";

describe("Globe v1 generator", () => {
  it.each(Object.entries(fixtures))(
    "keeps day %s byte-identical to its committed fixture",
    (day, name) => {
      const first = globeAnswer(Number(day), "v1");
      const regenerated = globeAnswer(Number(day), "v1");

      expect(first.name).toBe(name);
      expect(JSON.stringify(regenerated)).toBe(JSON.stringify(first));
    },
  );

  it("uses every country once before a shuffled deck repeats", () => {
    const expected = new Set(GLOBE_COUNTRIES.map((country) => country.iso));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const offset = cycle * GLOBE_COUNTRIES.length;
      const identities = Array.from(
        { length: GLOBE_COUNTRIES.length },
        (_, index) => globeAnswer(offset + index, "v1").iso,
      );
      expect(new Set(identities)).toEqual(expected);
      expect(new Set(identities).size).toBe(GLOBE_COUNTRIES.length);
    }
  });

  it("takes only day and version without ambient clock or RNG input", () => {
    const source = readFileSync("src/games/globe/generate.ts", "utf8");
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("ambient RNG leaked into the generator");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("wall clock leaked into the generator");
    });

    expect(globeAnswer.length).toBe(2);
    expect(source).not.toMatch(/Math\.random|\bDate\b/);
    expect(() => globeAnswer(208, "v1")).not.toThrow();
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it("rejects invalid days", () => {
    expect(() => globeAnswer(-1, "v1")).toThrow(
      "Day must be a non-negative safe integer",
    );
    expect(() => globeAnswer(0.5, "v1")).toThrow(
      "Day must be a non-negative safe integer",
    );
  });
});
