import { describe, expect, it } from "vitest";

import { GAME_ROSTER, gameIdOf, isGameSlug } from "./roster";

describe("GAME_ROSTER", () => {
  it("numbers the games contiguously in roster order: Word 0 … Angle 7", () => {
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
    ]);
    expect(gameIdOf("connections")).toBe(5);
    expect(gameIdOf("angle")).toBe(7);
  });

  it("derives the slug check from the roster", () => {
    expect(GAME_ROSTER.every((game) => isGameSlug(game.id))).toBe(true);
    expect(isGameSlug("nope")).toBe(false);
  });
});
