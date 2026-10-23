import { describe, expect, it } from "vitest";

import {
  betterCount,
  dayPercentile,
  formatScore,
  percentileFor,
  scoreBucket,
  topPercent,
  type Histogram,
} from "./percentile";

function histogram(entries: [bucket: number, count: number][]): Histogram {
  return {
    total: entries.reduce((sum, [, count]) => sum + count, 0),
    buckets: entries.map(([bucket, count]) => ({ bucket, count })),
  };
}

describe("scoreBucket", () => {
  it("buckets count scores exactly from 1 to 30 and everything above as 31+", () => {
    expect(scoreBucket("count", 1)).toBe(1);
    expect(scoreBucket("count", 30)).toBe(30);
    expect(scoreBucket("count", 31)).toBe(31);
    expect(scoreBucket("count", 400)).toBe(31);
    // A finish takes at least one guess; 0 cannot be a finisher's score.
    expect(scoreBucket("count", 0)).toBe(1);
  });

  it("buckets seconds in 15-second steps up to 30 minutes and above", () => {
    expect(scoreBucket("seconds", 0)).toBe(0);
    expect(scoreBucket("seconds", 14)).toBe(0);
    expect(scoreBucket("seconds", 15)).toBe(1);
    expect(scoreBucket("seconds", 201)).toBe(13);
    expect(scoreBucket("seconds", 1799)).toBe(119);
    expect(scoreBucket("seconds", 1800)).toBe(120);
    expect(scoreBucket("seconds", 99_999)).toBe(120);
  });

  it("rejects a score that is not a non-negative integer", () => {
    expect(() => scoreBucket("count", -1)).toThrow(RangeError);
    expect(() => scoreBucket("seconds", 1.5)).toThrow(RangeError);
  });
});

describe("topPercent", () => {
  it("is the rank share: ties take the better rank", () => {
    expect(topPercent(2, 0)).toBe(50);
    expect(topPercent(2, 1)).toBe(100);
    expect(topPercent(3, 0)).toBe(33);
    expect(topPercent(3, 1)).toBe(67);
    expect(topPercent(3, 2)).toBe(100);
  });

  it("gives the only finisher top 100%", () => {
    expect(topPercent(1, 0)).toBe(100);
  });

  it("is null with nobody to rank against", () => {
    expect(topPercent(0, 0)).toBeNull();
    expect(topPercent(3, 3)).toBeNull();
  });

  it("never drops below 1%", () => {
    expect(topPercent(1_000, 0)).toBe(1);
  });
});

describe("betterCount", () => {
  it("counts strictly lower buckets only", () => {
    const day = histogram([[2, 3], [4, 5], [5, 1], [31, 2]]);
    expect(betterCount(day, 1)).toBe(0);
    expect(betterCount(day, 4)).toBe(3);
    expect(betterCount(day, 5)).toBe(8);
    expect(betterCount(day, 31)).toBe(9);
  });
});

describe("percentileFor", () => {
  it("ranks a counted finisher inside the day's histogram", () => {
    // 10 finishers: 3 in 2 guesses, 5 in 4, 2 in 6. The player took 4.
    const day = histogram([[2, 3], [4, 5], [6, 2]]);
    expect(percentileFor(day, "count", 4, true)).toBe(40);
    expect(percentileFor(day, "count", 2, true)).toBe(10);
    expect(percentileFor(day, "count", 6, true)).toBe(90);
  });

  it("treats every score in one bucket as a tie", () => {
    const day = histogram([[31, 4]]);
    expect(percentileFor(day, "count", 31, true)).toBe(25);
    expect(percentileFor(day, "count", 300, true)).toBe(25);
    const sudoku = histogram([[13, 2], [20, 1]]);
    expect(percentileFor(sudoku, "seconds", 195, true)).toBe(33);
    expect(percentileFor(sudoku, "seconds", 209, true)).toBe(33);
    expect(percentileFor(sudoku, "seconds", 300, true)).toBe(100);
  });

  it("ranks the only finisher as top 100% and an empty day as a first finisher", () => {
    expect(percentileFor(histogram([[3, 1]]), "count", 3, true)).toBe(100);
    // Not counted yet (a lagging read, or a late finisher): inserted virtually.
    expect(percentileFor(histogram([]), "count", 3, false)).toBe(100);
    expect(percentileFor(histogram([]), "count", 3, true)).toBe(100);
  });

  it("ranks a late finisher as if inserted, without changing the day", () => {
    const day = histogram([[2, 1], [5, 1]]);
    expect(percentileFor(day, "count", 3, false)).toBe(67);
    expect(percentileFor(day, "count", 1, false)).toBe(33);
    expect(percentileFor(day, "count", 9, false)).toBe(100);
    expect(day.total).toBe(2);
  });
});

describe("dayPercentile", () => {
  it("is the rounded mean of the known game percentiles", () => {
    expect(dayPercentile([10, 50])).toBe(30);
    expect(dayPercentile([33, 33, 34])).toBe(33);
    expect(dayPercentile([1, null, 2])).toBe(2);
  });

  it("is null when no game has a percentile", () => {
    expect(dayPercentile([])).toBeNull();
    expect(dayPercentile([null, null])).toBeNull();
  });
});

describe("formatScore", () => {
  it("writes counts with their unit and seconds as m:ss", () => {
    expect(formatScore("count", 1)).toBe("1 guess");
    expect(formatScore("count", 4)).toBe("4 guesses");
    expect(formatScore("count", 2, "attempt")).toBe("2 attempts");
    expect(formatScore("count", 1, "mistake")).toBe("1 mistake");
    expect(formatScore("seconds", 185)).toBe("3:05");
    expect(formatScore("seconds", 0)).toBe("0:00");
  });
});
