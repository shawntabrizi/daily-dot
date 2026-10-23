import type { ScoreKind } from "./roster";

/**
 * A `(game, day)` distribution as `DailyScores.histogram` returns it: on-time
 * finishers per bucket (D20). `buckets` holds the non-empty buckets only.
 */
export interface HistogramBucket {
  bucket: number;
  count: number;
}

export interface Histogram {
  total: number;
  buckets: HistogramBucket[];
}

/** Mirrors `contracts/logic`: Count 1..=31 (31 = "31+"). */
export const COUNT_BUCKET_MAX = 31;
/** Mirrors `contracts/logic`: Seconds in 15 s steps 0..=120 (120 = "30 min+"). */
export const SECONDS_BUCKET_STEP = 15;
export const SECONDS_BUCKET_MAX = 120;

/**
 * The bucket a minimised score lands in. Must agree with the contract's
 * `score_bucket`: the app ranks the player inside the bucket it recorded to.
 */
export function scoreBucket(kind: ScoreKind, score: number): number {
  if (!Number.isInteger(score) || score < 0) {
    throw new RangeError("Score must be a non-negative integer");
  }
  if (kind === "count") {
    return Math.min(Math.max(score, 1), COUNT_BUCKET_MAX);
  }
  return Math.min(Math.floor(score / SECONDS_BUCKET_STEP), SECONDS_BUCKET_MAX);
}

/** Finishers in a strictly lower (better) bucket. */
export function betterCount(histogram: Histogram, bucket: number): number {
  return histogram.buckets
    .filter((entry) => entry.bucket < bucket)
    .reduce((sum, entry) => sum + entry.count, 0);
}

/**
 * "Top N% today".
 *
 * N is the finisher's rank as a share of all finishers: `(better + 1) /
 * total`, where `better` finishers scored a strictly lower bucket. Ties share
 * the better rank, so everyone in the best bucket is top `100 / total`
 * percent, and the only finisher of the day is top 100%. Rounded to the
 * nearest whole percent, never below 1. Null when there is nobody to rank
 * against. Ranking happens at bucket level: scores in one bucket (all of
 * "31+", one 15-second step) tie.
 */
export function topPercent(total: number, better: number): number | null {
  if (total <= 0 || better >= total) {
    return null;
  }
  return Math.max(1, Math.round(((better + 1) * 100) / total));
}

/**
 * The player's percentile for `score` against the day's histogram.
 *
 * `counted` says whether the player's own on-time record is already in the
 * histogram. A late finisher (backfill, never counted) and a lagging read
 * that does not yet show the player's bucket are ranked as if inserted, so
 * the only finisher of the day is top 100% either way.
 */
export function percentileFor(
  histogram: Histogram,
  kind: ScoreKind,
  score: number,
  counted: boolean,
): number | null {
  const bucket = scoreBucket(kind, score);
  const own = histogram.buckets.find((entry) => entry.bucket === bucket)?.count ?? 0;
  const total = counted && own > 0 ? histogram.total : histogram.total + 1;
  return topPercent(total, betterCount(histogram, bucket));
}

/**
 * The day's overall percentile: the mean of the game percentiles, rounded.
 *
 * A mean, not a rank over day totals, because the games have different
 * finisher counts and score kinds; a top 10% Sudoku and a top 50% Word day
 * reads as "top 30%". Null when no game has a percentile.
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

/** "4 guesses", "1 attempt", "3:05". */
export function formatScore(kind: ScoreKind, score: number, unit: ScoreUnit = "guess"): string {
  if (kind === "seconds") {
    const minutes = Math.floor(score / 60);
    const seconds = score % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  kind: ScoreKind,
  score: number,
  late: boolean,
): Histogram {
  const bucket = scoreBucket(kind, score);
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
export function holdsPlayer(histogram: Histogram, kind: ScoreKind, score: number): boolean {
  const bucket = scoreBucket(kind, score);
  return histogram.buckets.some((entry) => entry.bucket === bucket && entry.count > 0);
}
