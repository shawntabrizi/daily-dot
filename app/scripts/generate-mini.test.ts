import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { miniEntries, miniGridShapeError } from "../src/games/mini/grid";
import {
  assembleMiniFile,
  fillLayout,
  generateMiniGrids,
  MINI_LAYOUTS,
  MINI_MAX_USES,
  MINI_REPEAT_WINDOW_DAYS,
  WordIndex,
  wordEligible,
  type MiniPool,
} from "./generate-mini";

const pool = JSON.parse(
  readFileSync("../shared/mini/pool.source.json", "utf8"),
) as MiniPool;

describe("mini layouts", () => {
  it("every layout has 2–5 blacks, no two-letter entry, and exactly ten entries", () => {
    for (const layout of MINI_LAYOUTS) {
      expect(miniGridShapeError(layout), layout).toBeNull();
      const entries = miniEntries(layout);
      expect(entries.across.length + entries.down.length, layout).toBe(10);
      for (const entry of [...entries.across, ...entries.down]) {
        expect(entry.cells.length, layout).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("repeat rules", () => {
  it("blocks a word inside the 120-day window and frees it on day 120", () => {
    expect(wordEligible(undefined, 5)).toBe(true);
    expect(wordEligible({ lastDay: 10, uses: 1 }, 10 + MINI_REPEAT_WINDOW_DAYS - 1)).toBe(false);
    expect(wordEligible({ lastDay: 10, uses: 1 }, 10 + MINI_REPEAT_WINDOW_DAYS)).toBe(true);
    expect(MINI_REPEAT_WINDOW_DAYS).toBe(120);
  });

  it("retires a word after its last allowed use even outside the window", () => {
    expect(wordEligible({ lastDay: 0, uses: MINI_MAX_USES - 1 }, 500)).toBe(true);
    expect(wordEligible({ lastDay: 0, uses: MINI_MAX_USES }, 500)).toBe(false);
  });
});

describe("fill", () => {
  it("returns null instead of inventing a word when the pool cannot fill a layout", () => {
    const tiny = new Map<number, WordIndex>([
      [3, new WordIndex(["CAT", "DOG"], 3)],
      [4, new WordIndex(["CATS"], 4)],
      [5, new WordIndex(["CATCH"], 5)],
    ]);
    expect(fillLayout(MINI_LAYOUTS[8]!, tiny, 1_000)).toBeNull();
  });

  it("never uses one word twice in a grid and only uses pool words", () => {
    const eligible = new Map<number, WordIndex>(
      [3, 4, 5].map((length) => [length, new WordIndex(pool[String(length)]!, length)]),
    );
    const grid = fillLayout(MINI_LAYOUTS[0]!, eligible);
    expect(grid).not.toBeNull();
    const entries = miniEntries(grid!);
    const answers = [...entries.across, ...entries.down].map((entry) => entry.answer);
    expect(new Set(answers).size).toBe(answers.length);
    for (const answer of answers) {
      expect(pool[String(answer.length)]).toContain(answer);
    }
  });
});

describe("generator", () => {
  it("is deterministic from the seed and keeps every grid within the shape rule", () => {
    const first = generateMiniGrids(pool, 6, 7);
    const second = generateMiniGrids(pool, 6, 7);
    expect(second.grids).toEqual(first.grids);
    expect(generateMiniGrids(pool, 6, 8).grids).not.toEqual(first.grids);
    expect(first.grids).toHaveLength(6);
    const seen = new Set<string>();
    for (const grid of first.grids) {
      expect(miniGridShapeError(grid)).toBeNull();
      const entries = miniEntries(grid);
      for (const entry of [...entries.across, ...entries.down]) {
        // Six days are inside one window: no answer may recur at all.
        expect(seen.has(entry.answer), entry.answer).toBe(false);
        seen.add(entry.answer);
      }
    }
    expect(first.distinctAnswers).toEqual([...seen].sort());
  }, 60_000);

  it("refuses to assemble a set with an unclued answer", () => {
    const grids = generateMiniGrids(pool, 1, 7).grids;
    const { missing } = assembleMiniFile(grids, {});
    expect(missing.length).toBe(10);
    const clues = Object.fromEntries(missing.map((answer) => [answer, `clue for ${answer.toLowerCase()}`]));
    const assembled = assembleMiniFile(grids, clues);
    expect(assembled.missing).toEqual([]);
    expect(assembled.file.puzzles[0]?.across).toHaveLength(5);
    expect(assembled.file.puzzles[0]?.down).toHaveLength(5);
  }, 30_000);
});
