import { describe, expect, it, vi } from "vitest";

import type { DataSource, DayBits } from "./data-source";
import {
  dayComplete,
  loadDaySummary,
  loadHubStreaks,
  readDays,
  readStreakWindow,
  renderDaySummary,
} from "./day-summary";
import { GAME_ROSTER } from "./roster";
import { rosterMask } from "./streaks";

const MASK = rosterMask(GAME_ROSTER.map((game) => game.gameId));
const EMPTY: DayBits = { played: 0n, solved: 0n, ontime: 0n };
const FULL: DayBits = { played: MASK, solved: MASK, ontime: MASK };

function sourceWith(overrides: Partial<DataSource> = {}): DataSource {
  return {
    currentDay: async () => 100,
    wordAnswer: async () => "planet",
    dayBits: async () => EMPTY,
    dayBitsRange: async (_from, count) => Array.from({ length: count }, () => EMPTY),
    record: async () => undefined,
    ...overrides,
  };
}

describe("dayComplete", () => {
  it("needs every roster game's played bit, on time or not", () => {
    expect(dayComplete(FULL)).toBe(true);
    expect(dayComplete({ played: MASK, solved: 0n, ontime: 0n })).toBe(true);
    const first = GAME_ROSTER[0]!.gameId;
    expect(dayComplete({ played: MASK & ~(1n << BigInt(first)), solved: 0n, ontime: 0n })).toBe(false);
  });
});

describe("loadDaySummary", () => {
  it("reads every game's histogram and the account's details in one call each", async () => {
    const gameIds = GAME_ROSTER.map((game) => game.gameId);
    const histograms = vi.fn(async (_day: number, ids: readonly number[]) =>
      ids.map(() => ({ total: 4, buckets: [{ bucket: 1, count: 1 }, { bucket: 3, count: 3 }] })),
    );
    const details = vi.fn(async (_day: number, ids: readonly number[]) =>
      ids.map((id) => ({ score: id === 1 ? 20 : 3, solved: true })),
    );
    const summary = await loadDaySummary(sourceWith({ histograms, details }), 100, FULL);

    expect(histograms).toHaveBeenCalledTimes(1);
    expect(histograms).toHaveBeenCalledWith(100, gameIds);
    expect(details).toHaveBeenCalledTimes(1);
    expect(summary.complete).toBe(true);
    // Count games scored 3 (tied with two others behind one): rank 2 of 4.
    const word = summary.games.find((game) => game.game.id === "word")!;
    expect(word).toMatchObject({ played: true, late: false, score: 3, percentile: 50 });
    // Sudoku's 20 s is bucket 1: tied with the one finisher there: top 25%.
    const sudoku = summary.games.find((game) => game.game.id === "sudoku")!;
    expect(sudoku.percentile).toBe(25);
    expect(summary.dayPercentile).toBe(
      Math.round(summary.games.reduce((sum, game) => sum + game.percentile!, 0) / summary.games.length),
    );
  });

  it("marks a backfilled game as played later and ranks it as if inserted", async () => {
    const first = GAME_ROSTER[0]!;
    const bits: DayBits = { played: 1n << BigInt(first.gameId), solved: 1n << BigInt(first.gameId), ontime: 0n };
    const summary = await loadDaySummary(
      sourceWith({
        histograms: async (_day, ids) => ids.map(() => ({ total: 1, buckets: [{ bucket: 2, count: 1 }] })),
        details: async (_day, ids) => ids.map((id) => ({ score: id === first.gameId ? 2 : 0, solved: id === first.gameId })),
      }),
      99,
      bits,
    );
    const game = summary.games.find((entry) => entry.game.id === first.id)!;
    expect(game).toMatchObject({ played: true, late: true, score: 2, percentile: 50 });
    expect(summary.complete).toBe(false);
    expect(summary.games.filter((entry) => !entry.played).every((entry) => entry.score === null)).toBe(true);
  });

  it("gives scores but no percentiles when the source has no histogram reads", async () => {
    const summary = await loadDaySummary(
      sourceWith({ details: async (_day, ids) => ids.map(() => ({ score: 4, solved: true })) }),
      100,
      FULL,
    );
    expect(summary.games.every((game) => game.score === 4 && game.percentile === null)).toBe(true);
    expect(summary.dayPercentile).toBeNull();
  });
});

describe("readDays and readStreakWindow", () => {
  it("pages a long range in 64-day reads and pads a short page", async () => {
    const dayBitsRange = vi.fn(async (_from: number, count: number) =>
      Array.from({ length: Math.min(count, 10) }, () => FULL),
    );
    const days = await readDays(sourceWith({ dayBitsRange }), 0, 150);
    expect(days).toHaveLength(151);
    expect(dayBitsRange.mock.calls.map(([from, count]) => [from, count])).toEqual([
      [0, 64],
      [64, 64],
      [128, 23],
    ]);
    expect(days[9]).toBe(FULL);
    expect(days[10]).toEqual(EMPTY);
  });

  it("reads one page for a short streak and keeps paging back while the streak runs", async () => {
    const short = vi.fn(async (_from: number, count: number) =>
      Array.from({ length: count }, (_, offset) => (offset >= count - 3 ? FULL : EMPTY)),
    );
    await readStreakWindow(sourceWith({ dayBitsRange: short }), 200, MASK);
    expect(short).toHaveBeenCalledTimes(1);
    expect(short).toHaveBeenCalledWith(137, 64);

    const endless = vi.fn(async (_from: number, count: number) =>
      Array.from({ length: count }, () => FULL),
    );
    const days = await readStreakWindow(sourceWith({ dayBitsRange: endless }), 200, MASK);
    expect(days).toHaveLength(201);
    expect(endless.mock.calls.map(([from]) => from)).toEqual([137, 73, 9, 0]);
    expect((await loadHubStreaks(sourceWith({ dayBitsRange: endless }), 200)).any).toBe(201);
  });
});

describe("renderDaySummary", () => {
  it("lists each game's score and percentile and the day's mean", async () => {
    const summary = await loadDaySummary(
      sourceWith({
        histograms: async (_day, ids) => ids.map(() => ({ total: 10, buckets: [{ bucket: 2, count: 10 }] })),
        // Every game in the one bucket (2 guesses, or 30 s = bucket 2) except
        // Sudoku at 45 s (bucket 3), behind all ten finishers.
        details: async (_day, ids) => ids.map((id) => ({ score: id === 1 ? 45 : id === 10 ? 30 : 2, solved: true })),
      }),
      100,
      FULL,
    );
    const panel = renderDaySummary(summary, { any: 3, longestAny: 6, finished: 12 });
    // Mean of Sudoku's 100 and 10 for every other roster game.
    const mean = Math.round((100 + 10 * (GAME_ROSTER.length - 1)) / GAME_ROSTER.length);
    expect(panel.querySelector("[data-day-rank]")?.textContent).toBe(`Top ${mean}% today`);
    expect(panel.querySelector(".day-summary-note")?.textContent).toBe(
      `Across your ${GAME_ROSTER.length} games.`,
    );
    expect(panel.querySelector('[data-summary-game="word"]')?.textContent).toBe("Word2 guessesTop 10%");
    expect(panel.querySelector('[data-summary-game="chess"]')?.textContent).toBe("Chess2 attemptsTop 10%");
    expect(panel.querySelector('[data-summary-game="sudoku"]')?.textContent).toBe("Sudoku0:45Top 100%");
    // The streak lives in the header pill, not here; the counts are tiles,
    // each a number over its label.
    expect(panel.querySelector("[data-streak-any]")).toBeNull();
    const tiles = [...panel.querySelectorAll(".day-summary-stat")].map((tile) => [
      tile.querySelector("strong")?.textContent,
      tile.querySelector("span")?.textContent,
    ]);
    expect(tiles).toEqual([
      ["12", "Games finished"],
      ["6", "Best streak"],
    ]);
  });

  it("drops the per-game list on the hub, where the done rows already show it", async () => {
    const summary = await loadDaySummary(sourceWith({}), 100, FULL);
    const panel = renderDaySummary(summary, null, { games: false });
    expect(panel.querySelector("[data-summary-game]")).toBeNull();
    expect(panel.querySelector("[data-day-rank]")).not.toBeNull();
  });
});
