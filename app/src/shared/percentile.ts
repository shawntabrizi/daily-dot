import type { BucketSpec, Game, ScoreDirection, ScoreKind } from "./roster";

/**
 * A `(game, day)` distribution as `DailyScores.histogram` returns it: on-time
 * finishers per bucket (D20). `buckets` holds the non-empty buckets only;
 * bucket indices run from 0 to the spec's `buckets - 1`.
 */
export interface HistogramBucket {
  bucket: number;
  count: number;
}

export interface Histogram {
  total: number;
  buckets: HistogramBucket[];
}

/** What ranking needs from a game: how its scores bucket and which end wins. */
export type Ranked = Pick<Game, "buckets" | "better">;

/**
 * The bucket a score lands in under `spec`. Must agree with the contract's
 * `BucketSpec::bucket` (parity: `shared/bucket-test-vectors.json`): the app
 * ranks the player inside the bucket it recorded to. The contract has no
 * direction; buckets always run from low scores to high.
 */
export function scoreBucket(spec: BucketSpec, score: number): number {
  if (!Number.isInteger(score) || score < 0) {
    throw new RangeError("Score must be a non-negative integer");
  }
  if (score < spec.min) {
    return 0;
  }
  if (score >= spec.max) {
    return spec.buckets - 1;
  }
  // (score − min) < 2^32 and buckets ≤ 128, so the product stays inside a
  // double's exact integers: this is the contract's u64 floor.
  return Math.min(
    spec.buckets - 1,
    Math.floor(((score - spec.min) * spec.buckets) / (spec.max - spec.min)),
  );
}

/** True when bucket `a` ranks strictly ahead of bucket `b` in a game where `better` scores win. */
export function bucketBeats(better: ScoreDirection, a: number, b: number): boolean {
  return better === "lower" ? a < b : a > b;
}

/**
 * Finishers in a strictly better bucket: lower buckets for a lower-better
 * game, higher ones for a higher-better game.
 */
export function betterCount(
  histogram: Histogram,
  bucket: number,
  better: ScoreDirection,
): number {
  return histogram.buckets
    .filter((entry) => bucketBeats(better, entry.bucket, bucket))
    .reduce((sum, entry) => sum + entry.count, 0);
}

/**
 * "Top N% today".
 *
 * N is the finisher's rank as a share of all finishers: `(better + 1) /
 * total`, where `better` finishers scored a strictly better bucket. Ties share
 * the better rank, so everyone in the best bucket is top `100 / total`
 * percent, and the only finisher of the day is top 100%. Rounded to the
 * nearest whole percent, never below 1. Null when there is nobody to rank
 * against. Ranking happens at bucket level: scores in one bucket (all of
 * "31+", one 15-second step, one half point) tie.
 */
export function topPercent(total: number, better: number): number | null {
  if (total <= 0 || better >= total) {
    return null;
  }
  return Math.max(1, Math.round(((better + 1) * 100) / total));
}

/**
 * The player's percentile for `score` against the day's histogram, counted
 * from the game's better end.
 *
 * `counted` says whether the player's own on-time record is already in the
 * histogram. A late finisher (backfill, never counted) and a lagging read
 * that does not yet show the player's bucket are ranked as if inserted, so
 * the only finisher of the day is top 100% either way.
 */
export function percentileFor(
  histogram: Histogram,
  game: Ranked,
  score: number,
  counted: boolean,
): number | null {
  const bucket = scoreBucket(game.buckets, score);
  const own = histogram.buckets.find((entry) => entry.bucket === bucket)?.count ?? 0;
  const total = counted && own > 0 ? histogram.total : histogram.total + 1;
  return topPercent(total, betterCount(histogram, bucket, game.better));
}

/**
 * The day's overall percentile: the mean of the game percentiles, rounded.
 *
 * A mean, not a rank over day totals, because the games have different
 * finisher counts, score kinds and directions; a top 10% Sudoku and a top 50%
 * Word day reads as "top 30%". Null when no game has a percentile.
 */
export function dayPercentile(percentiles: readonly (number | null)[]): number | null {
  const known = percentiles.filter((value): value is number => value !== null);
  if (known.length === 0) {
    return null;
  }
  return Math.max(
    1,
    Math.round(known.reduce((sum, value) => sum + value, 0) / known.length),
  );
}

export type ScoreUnit = "guess" | "attempt" | "mistake";

/** A points score is kept in tenths (D24): 426 is "42.6", 420 is "42". */
export function formatPoints(tenths: number): string {
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

/** "m:ss" for a time in seconds. */
export function formatSeconds(score: number): string {
  const minutes = Math.floor(score / 60);
  const seconds = score % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The bare number a tile or an axis writes: "4", "3:05", "42.6". */
export function scoreValue(kind: ScoreKind, score: number): string {
  if (kind === "seconds") {
    return formatSeconds(score);
  }
  return kind === "points" ? formatPoints(score) : String(score);
}

/** "4 guesses", "1 attempt", "3:05", "42.6 points". */
export function formatScore(kind: ScoreKind, score: number, unit: ScoreUnit = "guess"): string {
  if (kind === "seconds") {
    return formatSeconds(score);
  }
  if (kind === "points") {
    return `${formatPoints(score)} ${score === 10 ? "point" : "points"}`;
  }
  const plural = unit.endsWith("s") ? `${unit}es` : `${unit}s`;
  return `${score} ${score === 1 ? unit : plural}`;
}

/**
 * The histogram with the player in it, for a saved result. The contract
 * never counts a late (past-day) record, and an on-time read can lag the
 * write; either way the player's own bucket is added here, once. An on-time
 * read that already shows the player's bucket is taken as counting them.
 */
export function withPlayer(
  histogram: Histogram,
  game: Pick<Game, "buckets">,
  score: number,
  late: boolean,
): Histogram {
  const bucket = scoreBucket(game.buckets, score);
  const own = histogram.buckets.find((entry) => entry.bucket === bucket)?.count ?? 0;
  if (!late && own > 0) {
    return histogram;
  }
  const buckets = own > 0
    ? histogram.buckets.map((entry) => (entry.bucket === bucket ? { bucket, count: entry.count + 1 } : entry))
    : [...histogram.buckets, { bucket, count: 1 }].sort((a, b) => a.bucket - b.bucket);
  return { total: histogram.total + 1, buckets };
}

/** True when an on-time read already holds the player's bucket. */
export function holdsPlayer(
  histogram: Histogram,
  game: Pick<Game, "buckets">,
  score: number,
): boolean {
  const bucket = scoreBucket(game.buckets, score);
  return histogram.buckets.some((entry) => entry.bucket === bucket && entry.count > 0);
}
