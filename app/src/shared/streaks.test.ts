import { describe, expect, it } from "vitest";
import { dateFromDayIndex } from "./day";
import {
  FIRST_MONDAY,
  deriveGameStats,
  deriveHubStreaks,
  hasGameBit,
  milestoneLine,
  nextMilestone,
  perfectWeeks,
  popcount,
  rosterMask,
} from "./streaks";

describe("hasGameBit", () => {
  it("reads every bit from game id 53 through 63", () => {
    const highBits = ((1n << 64n) - 1n) ^ ((1n << 53n) - 1n);

    for (let gameId = 53; gameId < 64; gameId += 1) {
      expect(hasGameBit(highBits, gameId)).toBe(true);
    }
  });

  it.each([-1, 64])("throws for out-of-range game id %i", (gameId) => {
    expect(() => hasGameBit(0n, gameId)).toThrow(RangeError);
  });
});

describe("popcount", () => {
  it("counts a full u64 bitmap", () => {
    expect(popcount((1n << 64n) - 1n)).toBe(64);
  });

  it("throws for a negative bitmap", () => {
    expect(() => popcount(-1n)).toThrow(RangeError);
  });
});

describe("deriveGameStats", () => {
  it("keeps yesterday's live streak during an unplayed today", () => {
    const stats = deriveGameStats(
      [
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 0n, solved: 0n, ontime: 0n },
      ],
      0,
    );

    expect(stats.streak).toBe(2);
  });

  it("includes today when today and yesterday both qualify", () => {
    const stats = deriveGameStats(
      [
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 1n, solved: 1n, ontime: 1n },
      ],
      0,
    );

    expect(stats.streak).toBe(2);
  });

  it("returns zero after both today and yesterday are missed", () => {
    const stats = deriveGameStats(
      [
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 0n, solved: 0n, ontime: 0n },
        { played: 0n, solved: 0n, ontime: 0n },
      ],
      0,
    );

    expect(stats.streak).toBe(0);
  });

  it("counts a backfill as completion without letting it repair an on-time streak", () => {
    const beforeBackfill = deriveGameStats(
      [
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 0n, solved: 0n, ontime: 0n },
        { played: 1n, solved: 1n, ontime: 1n },
      ],
      0,
    );
    const afterBackfill = deriveGameStats(
      [
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 1n, solved: 1n, ontime: 0n },
        { played: 1n, solved: 1n, ontime: 1n },
      ],
      0,
    );

    expect(beforeBackfill.streak).toBe(1);
    expect(afterBackfill.streak).toBe(1);
    expect(beforeBackfill.played).toBe(2);
    expect(afterBackfill.played).toBe(3);
  });

  it("uses solved over played for win rate", () => {
    const stats = deriveGameStats(
      [
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 1n, solved: 0n, ontime: 1n },
      ],
      0,
    );
    expect(stats.winRate).toBe(50);
  });

  it("does not count another game's play in per-game stats", () => {
    const gameOnly = deriveGameStats(
      [{ played: 1n, solved: 1n, ontime: 1n }],
      0,
    );
    const withAnotherGame = deriveGameStats(
      [{ played: 3n, solved: 1n, ontime: 1n }],
      0,
    );

    expect(withAnotherGame).toEqual(gameOnly);
  });

  it("ignores a bit outside the roster in played, win rate and streak", () => {
    // A set bit with no roster entry must change nothing for Word.
    const removed = 1n << 6n;
    const clean = deriveGameStats(
      [
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 1n, solved: 0n, ontime: 1n },
        { played: 1n, solved: 1n, ontime: 1n },
        { played: 0n, solved: 0n, ontime: 0n },
      ],
      0,
    );
    const withRemoved = deriveGameStats(
      [
        { played: 1n | removed, solved: 1n | removed, ontime: 1n | removed },
        { played: 1n | removed, solved: removed, ontime: 1n },
        { played: 1n, solved: 1n, ontime: 1n },
        { played: removed, solved: removed, ontime: removed },
      ],
      0,
    );

    expect(withRemoved).toEqual(clean);
    expect(withRemoved.played).toBe(3);
    expect(withRemoved.streak).toBe(1);
  });
});

describe("deriveHubStreaks", () => {
  // A three-game roster: bits 0, 1 and 4.
  const MASK = rosterMask([0, 1, 4]);
  const none = { played: 0n, solved: 0n, ontime: 0n };
  const one = { played: 1n, solved: 1n, ontime: 1n };
  const all = { played: MASK, solved: MASK, ontime: MASK };

  it("counts a streak from one finished game a day", () => {
    expect(deriveHubStreaks([one, one, one], MASK).any).toBe(3);
    // Finishing every game on a day counts the same as finishing one.
    expect(deriveHubStreaks([all, one, all], MASK).any).toBe(3);
  });

  it("gives the streak D17's one-day grace and zeroes it after two missed days", () => {
    expect(deriveHubStreaks([one, one, none], MASK).any).toBe(2);
    expect(deriveHubStreaks([one, one, none, none], MASK).any).toBe(0);
  });

  it("ignores games outside the roster", () => {
    const stray = { played: 1n << 9n, solved: 1n << 9n, ontime: 1n << 9n };
    expect(deriveHubStreaks([stray, stray], MASK)).toMatchObject({ any: 0, finished: 0 });
    const withStray = { played: 1n | (1n << 9n), solved: 1n, ontime: 1n | (1n << 9n) };
    expect(deriveHubStreaks([withStray], MASK)).toMatchObject({ any: 1, finished: 1 });
  });

  it("counts a backfilled day as finished games but not for the streak", () => {
    // Day 1 was finished from the archive (played, not ontime).
    const backfilled = { played: MASK, solved: MASK, ontime: 0n };
    const streaks = deriveHubStreaks([all, backfilled, all], MASK);
    expect(streaks.finished).toBe(9);
    expect(streaks.any).toBe(1);
  });

  it("tracks the longest any-game run, never below the live streak", () => {
    // Four gold days, a gap, two gold days, today unplayed (grace).
    const streaks = deriveHubStreaks([one, one, one, one, none, one, one, none], MASK);
    expect(streaks.longestAny).toBe(4);
    expect(streaks.any).toBe(2);
    // The live run is the longest one: best equals the streak, not less.
    const live = deriveHubStreaks([one, none, one, one, one], MASK);
    expect(live.any).toBe(3);
    expect(live.longestAny).toBe(3);
  });

  it("never extends the longest any-game run with a backfilled day", () => {
    const backfilled = { played: MASK, solved: MASK, ontime: 0n };
    const streaks = deriveHubStreaks([one, one, backfilled, one, one], MASK);
    expect(streaks.longestAny).toBe(2);
    expect(streaks.any).toBe(2);
  });

  it("rejects an empty roster mask", () => {
    expect(() => deriveHubStreaks([all], 0n)).toThrow(RangeError);
    expect(() => rosterMask([64])).toThrow(RangeError);
  });
});

describe("nextMilestone", () => {
  it.each([
    [0, 7],
    [6, 7],
    [7, 30],
    [14, 30],
    [29, 30],
    [30, 100],
    [100, 365],
    [364, 365],
  ])("after a %i-day streak the next milestone is %i", (any, next) => {
    expect(nextMilestone(any)).toBe(next);
  });

  it("has no milestone after 365", () => {
    expect(nextMilestone(365)).toBeNull();
    expect(nextMilestone(400)).toBeNull();
  });
});

describe("milestoneLine", () => {
  it.each([7, 30, 100, 365])("celebrates %i days", (any) => {
    expect(milestoneLine(any)).toBe(`${any} days. Keep it.`);
  });

  it.each([0, 1, 6, 8, 29, 366])("stays silent on %i days", (any) => {
    expect(milestoneLine(any)).toBeNull();
  });
});

describe("perfectWeeks", () => {
  const MASK = rosterMask([0, 1, 4]);
  const none = { played: 0n, solved: 0n, ontime: 0n };
  const one = { played: 1n, solved: 1n, ontime: 1n };
  const later = { played: 1n, solved: 1n, ontime: 0n };
  const outside = { played: 4n, solved: 4n, ontime: 4n };
  const fill = (length: number, bits = one) => Array.from({ length }, () => bits);

  it("pins the week to Monday: day 4 (2026-01-05) opens the first week", () => {
    expect(dateFromDayIndex(FIRST_MONDAY).getUTCDay()).toBe(1);
    expect(dateFromDayIndex(FIRST_MONDAY - 1).getUTCDay()).toBe(0);
  });

  it("marks the seven days of a Monday-to-Sunday week that all have a game", () => {
    // Days 0–3 are before the first Monday; days 4–10 are the first week.
    const weeks = perfectWeeks(fill(11), MASK);
    expect([...weeks].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it("never marks a week with a day that had no game, nor a week the window cuts short", () => {
    const days = fill(17);
    days[7] = none;
    // Week 4–10 misses day 7; week 11–17 needs day 17, which is not in the window.
    expect(perfectWeeks(days, MASK).size).toBe(0);
  });

  it("counts a backfilled day: the calendar counts play, the streak does not", () => {
    const days = fill(11);
    days[6] = later;
    expect(perfectWeeks(days, MASK).has(6)).toBe(true);
  });

  it("ignores a game outside the roster", () => {
    const days = fill(11);
    days[6] = outside;
    expect(perfectWeeks(days, MASK).size).toBe(0);
  });

  it("rejects an empty roster mask", () => {
    expect(() => perfectWeeks(fill(11), 0n)).toThrow(RangeError);
  });
});
