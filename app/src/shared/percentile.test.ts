import { describe, expect, it } from "vitest";

import vectorsJson from "../../../shared/bucket-test-vectors.json";
import {
  betterCount,
  dayPercentile,
  formatScore,
  holdsPlayer,
  percentileFor,
  scoreBucket,
  topPercent,
  withPlayer,
  type Histogram,
  type Ranked,
} from "./percentile";
import { COUNT_BUCKETS, SECONDS_BUCKETS, type BucketSpec } from "./roster";

function histogram(entries: [bucket: number, count: number][]): Histogram {
  return {
    total: entries.reduce((sum, [, count]) => sum + count, 0),
    buckets: entries.map(([bucket, count]) => ({ bucket, count })),
  };
}

const COUNT: Ranked = { buckets: COUNT_BUCKETS, better: "lower" };
const SECONDS: Ranked = { buckets: SECONDS_BUCKETS, better: "lower" };
/** Daily Color's shape (D24): tenths of a point out of 50, higher better. */
const POINTS: Ranked = { buckets: { min: 0, max: 500, buckets: 100 }, better: "higher" };

interface BucketVectors {
  specs: Record<string, BucketSpec>;
  vectors: { spec: string; score: number; bucket: number }[];
}
const vectors = vectorsJson as BucketVectors;

describe("scoreBucket", () => {
  it("matches every shared parity vector (the contract's BucketSpec::bucket)", () => {
    expect(vectors.vectors.length).toBeGreaterThan(0);
    for (const vector of vectors.vectors) {
      const spec = vectors.specs[vector.spec];
      expect(spec, vector.spec).toBeDefined();
      expect(scoreBucket(spec!, vector.score), `${vector.spec} ${vector.score}`).toBe(vector.bucket);
    }
  });

  it("uses the roster specs the parity file names", () => {
    expect(vectors.specs.count).toEqual(COUNT_BUCKETS);
    expect(vectors.specs.seconds).toEqual(SECONDS_BUCKETS);
  });

  it("buckets count scores exactly from 1 to 30 and everything above as 31+", () => {
    expect(scoreBucket(COUNT_BUCKETS, 1)).toBe(0);
    expect(scoreBucket(COUNT_BUCKETS, 30)).toBe(29);
    expect(scoreBucket(COUNT_BUCKETS, 31)).toBe(30);
    expect(scoreBucket(COUNT_BUCKETS, 400)).toBe(30);
    // Below min shares the first bucket: 0 cannot be a finisher's count.
    expect(scoreBucket(COUNT_BUCKETS, 0)).toBe(0);
  });

  it("buckets seconds in 15-second steps up to 30 minutes and above", () => {
    expect(scoreBucket(SECONDS_BUCKETS, 0)).toBe(0);
    expect(scoreBucket(SECONDS_BUCKETS, 14)).toBe(0);
    expect(scoreBucket(SECONDS_BUCKETS, 15)).toBe(1);
    expect(scoreBucket(SECONDS_BUCKETS, 201)).toBe(13);
    expect(scoreBucket(SECONDS_BUCKETS, 1799)).toBe(119);
    expect(scoreBucket(SECONDS_BUCKETS, 1800)).toBe(120);
    expect(scoreBucket(SECONDS_BUCKETS, 99_999)).toBe(120);
  });

  it("rejects a score that is not a non-negative integer", () => {
    expect(() => scoreBucket(COUNT_BUCKETS, -1)).toThrow(RangeError);
    expect(() => scoreBucket(SECONDS_BUCKETS, 1.5)).toThrow(RangeError);
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
  const day = histogram([[1, 3], [3, 5], [4, 1], [30, 2]]);

  it("counts strictly lower buckets for a lower-better game", () => {
    expect(betterCount(day, 0, "lower")).toBe(0);
    expect(betterCount(day, 3, "lower")).toBe(3);
    expect(betterCount(day, 4, "lower")).toBe(8);
    expect(betterCount(day, 30, "lower")).toBe(9);
  });

  it("counts strictly higher buckets for a higher-better game", () => {
    expect(betterCount(day, 30, "higher")).toBe(0);
    expect(betterCount(day, 4, "higher")).toBe(2);
    expect(betterCount(day, 3, "higher")).toBe(3);
    expect(betterCount(day, 0, "higher")).toBe(11);
  });
});

describe("percentileFor", () => {
  it("ranks a counted finisher inside the day's histogram", () => {
    // 10 finishers: 3 in 2 guesses, 5 in 4, 2 in 6 (buckets 1, 3, 5). The player took 4.
    const day = histogram([[1, 3], [3, 5], [5, 2]]);
    expect(percentileFor(day, COUNT, 4, true)).toBe(40);
    expect(percentileFor(day, COUNT, 2, true)).toBe(10);
    expect(percentileFor(day, COUNT, 6, true)).toBe(90);
  });

  it("treats every score in one bucket as a tie", () => {
    const day = histogram([[30, 4]]);
    expect(percentileFor(day, COUNT, 31, true)).toBe(25);
    expect(percentileFor(day, COUNT, 300, true)).toBe(25);
    const sudoku = histogram([[13, 2], [20, 1]]);
    expect(percentileFor(sudoku, SECONDS, 195, true)).toBe(33);
    expect(percentileFor(sudoku, SECONDS, 209, true)).toBe(33);
    expect(percentileFor(sudoku, SECONDS, 300, true)).toBe(100);
  });

  it("ranks a higher-better game from the top bucket down", () => {
    // 10 finishers: 2 at 45 points (bucket 90), 5 at 30 (60), 3 at 10 (20).
    const day = histogram([[20, 3], [60, 5], [90, 2]]);
    expect(percentileFor(day, POINTS, 450, true)).toBe(10);
    expect(percentileFor(day, POINTS, 300, true)).toBe(30);
    expect(percentileFor(day, POINTS, 100, true)).toBe(80);
    // The same histogram read lower-better puts the 10-pointers on top:
    // the direction is what ranks, not the bucket index.
    const flipped: Ranked = { ...POINTS, better: "lower" };
    expect(percentileFor(day, flipped, 100, true)).toBe(10);
    expect(percentileFor(day, flipped, 450, true)).toBe(90);
  });

  it("ranks a late higher-better finisher as if inserted, ties in their favor", () => {
    const day = histogram([[90, 1], [60, 1]]);
    expect(percentileFor(day, POINTS, 499, false)).toBe(33);
    expect(percentileFor(day, POINTS, 300, false)).toBe(67);
    expect(percentileFor(day, POINTS, 0, false)).toBe(100);
  });

  it("ranks the only finisher as top 100% and an empty day as a first finisher", () => {
    expect(percentileFor(histogram([[2, 1]]), COUNT, 3, true)).toBe(100);
    // Not counted yet (a lagging read, or a late finisher): inserted virtually.
    expect(percentileFor(histogram([]), COUNT, 3, false)).toBe(100);
    expect(percentileFor(histogram([]), COUNT, 3, true)).toBe(100);
    expect(percentileFor(histogram([]), POINTS, 250, true)).toBe(100);
  });

  it("ranks a late finisher as if inserted, without changing the day", () => {
    const day = histogram([[1, 1], [4, 1]]);
    expect(percentileFor(day, COUNT, 3, false)).toBe(67);
    expect(percentileFor(day, COUNT, 1, false)).toBe(33);
    expect(percentileFor(day, COUNT, 9, false)).toBe(100);
    expect(day.total).toBe(2);
  });
});

describe("withPlayer and holdsPlayer", () => {
  it("find the player's bucket by the game's spec", () => {
    const day = histogram([[3, 2]]);
    expect(holdsPlayer(day, COUNT, 4)).toBe(true);
    expect(holdsPlayer(day, COUNT, 3)).toBe(false);
    expect(holdsPlayer(day, SECONDS, 45)).toBe(true);
    expect(withPlayer(day, COUNT, 4, false)).toBe(day);
    expect(withPlayer(day, COUNT, 4, true)).toEqual(histogram([[3, 3]]));
    expect(withPlayer(day, POINTS, 495, false)).toEqual(histogram([[3, 2], [99, 1]]));
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
  it("writes counts with their unit, seconds as m:ss and points in tenths", () => {
    expect(formatScore("count", 1)).toBe("1 guess");
    expect(formatScore("count", 4)).toBe("4 guesses");
    expect(formatScore("count", 2, "attempt")).toBe("2 attempts");
    expect(formatScore("count", 1, "mistake")).toBe("1 mistake");
    expect(formatScore("seconds", 185)).toBe("3:05");
    expect(formatScore("seconds", 0)).toBe("0:00");
    expect(formatScore("points", 426)).toBe("42.6 points");
    expect(formatScore("points", 420)).toBe("42 points");
    expect(formatScore("points", 10)).toBe("1 point");
    expect(formatScore("points", 0)).toBe("0 points");
  });
});
