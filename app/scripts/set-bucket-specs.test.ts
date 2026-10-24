import { describe, expect, it } from "vitest";

import { gameById } from "../src/shared/roster";
import { bucketSpecFromContract, planBucketSpec } from "./set-bucket-specs";

const SUDOKU = gameById("sudoku")!;

describe("planBucketSpec", () => {
  it("sets an unset game to the roster's spec", () => {
    // Unset reads as the default count spec with set: false.
    expect(planBucketSpec(SUDOKU, { min: 1, max: 32, buckets: 31, set: false })).toEqual({
      game: SUDOKU,
      action: "set",
      spec: { min: 0, max: 1815, buckets: 121 },
    });
  });

  it("skips a game already at the roster's spec", () => {
    expect(planBucketSpec(SUDOKU, { min: 0, max: 1815, buckets: 121, set: true }).action).toBe("skip");
  });

  it("stops on a game set to another spec, naming it (specs are set once)", () => {
    expect(() => planBucketSpec(SUDOKU, { min: 1, max: 32, buckets: 31, set: true })).toThrow(
      /Daily Sudoku \(game 1\) is already set/,
    );
  });
});

describe("bucketSpecFromContract", () => {
  it("reads viem's named tuple, uints as number or bigint", () => {
    expect(bucketSpecFromContract({ min: 0, max: 1815n, buckets: 121, set: true })).toEqual({
      min: 0,
      max: 1815,
      buckets: 121,
      set: true,
    });
    expect(() => bucketSpecFromContract([0, 1815, 121, true])).toThrow(TypeError);
  });
});
