import { describe, expect, it, vi } from "vitest";

import fixtures from "./fixtures/v1.json";
import {
  countSudokuSolutions,
  generateSudoku,
  solveSudoku,
  solveSudokuWithSingles,
  type Grid,
} from "./generate";

function serialize(grid: Grid): string {
  return grid.flat().join("");
}

describe("Sudoku v1 generator", () => {
  it.each(Object.entries(fixtures))(
    "keeps day %s byte-identical to its committed fixture",
    (day, fixture) => {
      const first = generateSudoku(Number(day), "v1");
      const regenerated = generateSudoku(Number(day), "v1");

      expect(serialize(first.puzzle)).toBe(fixture.puzzle);
      expect(serialize(first.solution)).toBe(fixture.solution);
      expect(JSON.stringify(regenerated)).toBe(JSON.stringify(first));
    },
  );

  it("proves unique solvability across more than twenty generated days", () => {
    for (let day = 0; day < 24; day += 1) {
      const generated = generateSudoku(day, "v1");
      expect(countSudokuSolutions(generated.puzzle)).toBe(1);
      expect(solveSudoku(generated.puzzle)).toEqual(generated.solution);
    }
  });

  it("holds v1 in one measured difficulty band", () => {
    for (const day of [0, 1, 100, 208, 364]) {
      const generated = generateSudoku(day, "v1");
      const clueCount = generated.puzzle.flat().filter((value) => value !== 0).length;

      expect(clueCount).toBe(30);
      expect(solveSudokuWithSingles(generated.puzzle)).toEqual(generated.solution);
    }
  });

  it("does not read ambient randomness or the wall clock", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("ambient RNG leaked into the generator");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("wall clock leaked into the generator");
    });

    expect(() => generateSudoku(208, "v1")).not.toThrow();
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });
});
