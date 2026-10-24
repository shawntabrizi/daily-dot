import { describe, expect, it } from "vitest";

import { GAME_ROSTER, gameIdOf, isGameSlug } from "./roster";

describe("GAME_ROSTER", () => {
  it("numbers the games contiguously in roster order: Word 0 … Sound 9", () => {
    // The ids index the D5 bitmaps on chain; a gap or a swap would move a
    // player's recorded days to another game.
    expect(GAME_ROSTER.map((game) => [game.id, game.gameId])).toEqual([
      ["word", 0],
      ["sudoku", 1],
      ["chess", 2],
      ["globe", 3],
      ["mini", 4],
      ["connections", 5],
      ["code", 6],
      ["angle", 7],
      ["color", 8],
      ["sound", 9],
    ]);
    expect(gameIdOf("connections")).toBe(5);
    expect(gameIdOf("angle")).toBe(7);
    expect(gameIdOf("color")).toBe(8);
    expect(gameIdOf("sound")).toBe(9);
  });

  it("derives the slug check from the roster", () => {
    expect(GAME_ROSTER.every((game) => isGameSlug(game.id))).toBe(true);
    expect(isGameSlug("nope")).toBe(false);
  });
});

describe("roster bucket specs and direction", () => {
  it("gives each game the WP40 spec: counts 1–30 then 31+, times in 15 s steps to 30:00+, points in half-point steps, higher better", () => {
    // These must equal what `set-bucket-specs` writes on chain (set once):
    // a change here would rank players against the wrong buckets.
    expect(
      Object.fromEntries(GAME_ROSTER.map((game) => [game.id, [game.better, game.buckets]])),
    ).toEqual({
      word: ["lower", { min: 1, max: 32, buckets: 31 }],
      sudoku: ["lower", { min: 0, max: 1815, buckets: 121 }],
      chess: ["lower", { min: 1, max: 32, buckets: 31 }],
      globe: ["lower", { min: 1, max: 32, buckets: 31 }],
      mini: ["lower", { min: 0, max: 1815, buckets: 121 }],
      connections: ["lower", { min: 1, max: 32, buckets: 31 }],
      code: ["lower", { min: 1, max: 32, buckets: 31 }],
      angle: ["lower", { min: 1, max: 32, buckets: 31 }],
      color: ["higher", { min: 0, max: 500, buckets: 100 }],
      sound: ["higher", { min: 0, max: 500, buckets: 100 }],
    });
  });

  it("keeps every spec inside what the contract accepts", () => {
    for (const { buckets } of GAME_ROSTER) {
      expect(Number.isInteger(buckets.min) && Number.isInteger(buckets.max)).toBe(true);
      expect(buckets.max).toBeGreaterThan(buckets.min);
      expect(buckets.buckets).toBeGreaterThanOrEqual(1);
      expect(buckets.buckets).toBeLessThanOrEqual(128);
    }
  });
});
